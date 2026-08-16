// ============================================================================
// 核心层（用例层）：执行器服务
// 职责：执行器管理、状态表、开/关命令发送、写响应确认
// 依赖注入：mqttGateway（发送）、storage（持久化）、emitter（解耦通知）
// ============================================================================

import { presetActuators } from '../entities/presets.js';
import { buildWriteCommand } from './modbus.js';

/** 无缓存时默认加载的执行器 */
const DEFAULT_ACTUATOR_IDS = ['doorLock', 'alarmLight', 'fan', 'ledLight'];

export class ActuatorService {
    constructor({ mqttGateway, storage, emitter }) {
        this.mqttGateway = mqttGateway;
        this.storage = storage;
        this.bus = emitter;
        this.actuators = [];
        this.states = {};
    }

    list() {
        return this.actuators;
    }

    get(id) {
        return this.actuators.find(a => a.id === id);
    }

    has(id) {
        return this.actuators.some(a => a.id === id);
    }

    getState(id) {
        return !!this.states[id];
    }

    add(config) {
        if (this.has(config.id)) return false;
        if (this.states[config.id] === undefined) {
            this.states[config.id] = false;
        }
        this.actuators.push(config);
        this.persist();
        this.bus.emit('actuator-added', config);
        return true;
    }

    remove(id) {
        const index = this.actuators.findIndex(a => a.id === id);
        if (index === -1) return false;
        this.actuators.splice(index, 1);
        delete this.states[id];
        this.persist();
        this.bus.emit('actuator-removed', id);
        return true;
    }

    /**
     * 切换执行器状态（手动控制）
     */
    toggle(id) {
        return this.setTo(id, !this.states[id]);
    }

    /**
     * 将执行器设为指定状态（手动与场景联动共用入口）
     * 状态未变化时不发送任何命令
     * @returns {boolean} 是否实际执行了状态切换
     */
    setTo(id, targetState) {
        const actuator = this.get(id);
        if (!actuator) return false;

        const target = !!targetState;
        if (this.states[id] === target) return false;

        const command = buildWriteCommand(actuator, target);
        if (!command) return false;

        this.states[id] = target;
        this.mqttGateway.send(command);
        this.persist();
        this.bus.emit('actuator-state', { actuatorId: id, state: target });
        return true;
    }

    /**
     * 处理写操作确认响应（0x05/0x06/0x0F/0x10）
     */
    handleWriteResponse(data) {
        const address = data.coilAddr !== undefined ? data.coilAddr
            : data.regAddr !== undefined ? data.regAddr
            : data.startAddr;
        const actuator = this.actuators.find(a =>
            a.slaveAddr === data.slaveAddr &&
            a.funcCode === data.funcCode &&
            a.startReg === address
        );
        if (actuator) {
            this.bus.emit('actuator-confirm', { actuator, data });
        }
    }

    loadFromCache() {
        const { actuators, states } = this.storage.loadActuators();
        if (actuators) {
            actuators.forEach(config => {
                if (!this.has(config.id)) {
                    this.actuators.push(config);
                    this.states[config.id] = states[config.id] ?? false;
                }
            });
        } else {
            // 无缓存：加载默认执行器
            DEFAULT_ACTUATOR_IDS.forEach(id => {
                const config = presetActuators[id];
                if (config && !this.has(config.id)) {
                    this.actuators.push(config);
                    this.states[config.id] = false;
                }
            });
            this.persist();
        }
        return this.actuators;
    }

    persist() {
        this.storage.saveActuators(this.actuators, this.states);
    }
}
