// ============================================================================
// 核心层（用例层）：传感器服务
// 职责：活动传感器管理、轮询调度（按请求去重）、值缓存与数据分发
// 依赖注入：mqttGateway（发送）、storage（持久化）、emitter（解耦通知）
// ============================================================================

import { presetSensors, requestKey, createCustomSensor, defaultExtract } from '../entities/presets.js';
import { buildReadCommand } from './modbus.js';

/** 无缓存时默认加载的传感器 */
const DEFAULT_SENSOR_IDS = ['lightSensor', 'tempSensor', 'humiditySensor', 'noiseSensor'];

function serializeCustom(sensor) {
    return {
        name: sensor.name,
        unit: sensor.unit,
        color: sensor.color,
        interval: sensor.request.interval,
        slaveAddr: sensor.request.slaveAddr,
        funcCode: sensor.request.funcCode,
        startReg: sensor.request.startReg,
        regCount: sensor.request.regCount
    };
}

export class SensorService {
    constructor({ mqttGateway, storage, emitter }) {
        this.mqttGateway = mqttGateway;
        this.storage = storage;
        this.bus = emitter;
        this.sensors = [];
        this.sensorValues = {};
        this.intervals = {};      // requestKey -> intervalId（轮询去重）
        this.requestSensors = {}; // requestKey -> [sensorId]
    }

    list() {
        return this.sensors;
    }

    get(id) {
        return this.sensors.find(s => s.id === id);
    }

    has(id) {
        return this.sensors.some(s => s.id === id);
    }

    /**
     * 添加传感器（预设或自定义配置均可）
     * @param {Object} config 完整传感器配置
     * @returns {boolean}
     */
    add(config) {
        if (this.has(config.id)) return false;
        this.sensors.push(config);
        this.startPolling(config);
        this.persist();
        this.bus.emit('sensor-added', config);
        return true;
    }

    /**
     * 删除传感器
     * @returns {boolean}
     */
    remove(id) {
        const sensor = this.get(id);
        if (!sensor) return false;
        this.stopPolling(sensor);
        this.sensors = this.sensors.filter(s => s.id !== id);
        delete this.sensorValues[id];
        this.persist();
        this.bus.emit('sensor-removed', id);
        return true;
    }

    /**
     * 启动轮询。相同请求配置（从机+功能码+起始+数量）共享一个定时器
     */
    startPolling(config) {
        const key = requestKey(config.request);
        const existing = this.requestSensors[key];
        if (existing) {
            if (!existing.includes(config.id)) {
                existing.push(config.id);
            }
            return;
        }

        this.requestSensors[key] = [config.id];
        const command = buildReadCommand(
            config.request.slaveAddr,
            config.request.funcCode,
            config.request.startReg,
            config.request.regCount
        );
        this.intervals[key] = setInterval(() => {
            if (this.mqttGateway.isConnected()) {
                this.mqttGateway.send(command);
            }
        }, config.request.interval);
    }

    /**
     * 停止轮询（共享定时器仅在所有使用方移除后停止）
     */
    stopPolling(config) {
        const key = requestKey(config.request);
        const ids = this.requestSensors[key];
        if (!ids) return;
        const index = ids.indexOf(config.id);
        if (index > -1) {
            ids.splice(index, 1);
        }
        if (ids.length === 0) {
            clearInterval(this.intervals[key]);
            delete this.intervals[key];
            delete this.requestSensors[key];
        }
    }

    persist() {
        const custom = {};
        this.sensors.forEach(s => {
            if (s.isCustom) {
                custom[s.id] = serializeCustom(s);
            }
        });
        this.storage.saveSensors(this.sensors.map(s => s.id), custom);
    }

    /**
     * 从缓存恢复活动传感器（预设 + 自定义）；无缓存时加载默认传感器
     * @returns {Array} 恢复的传感器配置列表
     */
    loadFromCache() {
        const { hasCache, sensorIds, customSensors } = this.storage.loadSensors();
        const customMap = new Map(
            Object.entries(customSensors).map(([id, c]) => [id, createCustomSensor(c)])
        );
        const ids = hasCache ? sensorIds : DEFAULT_SENSOR_IDS;
        ids.forEach(id => {
            const config = customMap.get(id) || presetSensors[id];
            if (config && !this.has(id)) {
                this.sensors.push(config);
                this.startPolling(config);
            }
        });
        if (!hasCache) {
            this.persist();
        }
        return this.sensors;
    }

    /**
     * 处理读响应数据：匹配传感器 → 提取值 → 更新缓存并发布事件
     * @param {{slaveAddr:number, funcCode:number, value:Array, rawData:string}} data
     */
    handleReadResponse(data) {
        const matched = this.sensors.filter(s =>
            s.request.slaveAddr === data.slaveAddr &&
            s.request.funcCode === data.funcCode
        );
        if (matched.length === 0) return;

        matched.forEach(sensor => {
            const extract = sensor.extractValue || defaultExtract;
            const value = extract(data.value);
            this.sensorValues[sensor.id] = value;
            this.bus.emit('sensor-value', {
                sensorId: sensor.id,
                value,
                rawData: data.rawData
            });
        });
    }

    /**
     * 处理异常响应：通知匹配的传感器卡片显示异常
     * @param {{slaveAddr:number, funcCode:number, exceptionMessage:string, rawData:string}} data
     */
    handleException(data) {
        // 异常功能码含最高位标志，用掩码还原原始请求功能码
        const originalFuncCode = data.funcCode & 0x7F;
        const matched = this.sensors.filter(s =>
            s.request.slaveAddr === data.slaveAddr &&
            s.request.funcCode === originalFuncCode
        );
        matched.forEach(sensor => {
            this.bus.emit('sensor-error', {
                sensorId: sensor.id,
                message: data.exceptionMessage,
                rawData: data.rawData
            });
        });
    }
}
