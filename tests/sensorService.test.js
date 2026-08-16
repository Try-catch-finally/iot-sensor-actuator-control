// ============================================================================
// 单元测试：传感器服务（轮询调度、值提取、缓存）
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SensorService } from '../src/core/sensorService.js';
import { createEmitter } from '../src/core/emitter.js';
import { presetSensors } from '../src/entities/presets.js';

const fakeStorage = {
    saveSensors: vi.fn(),
    loadSensors: vi.fn(() => ({ hasCache: true, sensorIds: [], customSensors: {} }))
};

function makeService() {
    const emitter = createEmitter();
    const mqtt = { isConnected: () => true, send: vi.fn() };
    const service = new SensorService({ mqttGateway: mqtt, storage: fakeStorage, emitter });
    return { service, mqtt, emitter };
}

describe('SensorService 基础管理', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        fakeStorage.saveSensors.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('添加传感器：注册轮询并持久化', () => {
        const { service } = makeService();
        expect(service.add(presetSensors.lightSensor)).toBe(true);
        expect(service.has('lightSensor')).toBe(true);
        expect(fakeStorage.saveSensors).toHaveBeenCalled();
        expect(service.list()).toHaveLength(1);
    });

    it('重复添加同一传感器被拒绝', () => {
        const { service } = makeService();
        service.add(presetSensors.lightSensor);
        expect(service.add(presetSensors.lightSensor)).toBe(false);
        expect(service.list()).toHaveLength(1);
    });

    it('删除传感器：停止轮询并持久化', () => {
        const { service, mqtt } = makeService();
        service.add(presetSensors.lightSensor);
        expect(service.remove('lightSensor')).toBe(true);
        expect(service.has('lightSensor')).toBe(false);

        // 定时器已停止：推进时间不发送任何命令
        vi.advanceTimersByTime(6000 * 5);
        expect(mqtt.send).not.toHaveBeenCalled();
    });

    it('按请求周期轮询发送读命令', () => {
        const { service, mqtt } = makeService();
        service.add(presetSensors.lightSensor); // interval 6000ms
        vi.advanceTimersByTime(6000);
        expect(mqtt.send).toHaveBeenCalledTimes(1);
        expect(mqtt.send).toHaveBeenCalledWith('02030002000125F9');
        vi.advanceTimersByTime(6000 * 3);
        expect(mqtt.send).toHaveBeenCalledTimes(4);
    });

    it('相同请求配置的传感器共享一个轮询定时器', () => {
        const { service, mqtt } = makeService();
        // tempSensor 与 humiditySensor 共用从机 0x03 请求
        service.add(presetSensors.tempSensor);
        service.add(presetSensors.humiditySensor);
        vi.advanceTimersByTime(5000 * 2);
        // 一个定时器 → 每个周期只发一次命令
        expect(mqtt.send).toHaveBeenCalledTimes(2);
    });

    it('共享请求的传感器全部移除后定时器停止', () => {
        const { service, mqtt } = makeService();
        service.add(presetSensors.tempSensor);
        service.add(presetSensors.humiditySensor);
        service.remove('tempSensor');
        service.remove('humiditySensor');
        vi.advanceTimersByTime(5000 * 3);
        expect(mqtt.send).not.toHaveBeenCalled();
    });
});

describe('SensorService 缓存恢复', () => {
    beforeEach(() => {
        fakeStorage.saveSensors.mockClear();
    });

    it('无缓存时加载默认传感器', () => {
        fakeStorage.loadSensors.mockReturnValueOnce({ hasCache: false, sensorIds: [], customSensors: {} });
        const { service } = makeService();
        const restored = service.loadFromCache();
        expect(restored.map(s => s.id)).toEqual(['lightSensor', 'tempSensor', 'humiditySensor', 'noiseSensor']);
        expect(fakeStorage.saveSensors).toHaveBeenCalled();
    });

    it('有缓存时按缓存加载', () => {
        fakeStorage.loadSensors.mockReturnValueOnce({
            hasCache: true,
            sensorIds: ['co2Sensor'],
            customSensors: {}
        });
        const { service } = makeService();
        const restored = service.loadFromCache();
        expect(restored.map(s => s.id)).toEqual(['co2Sensor']);
        expect(fakeStorage.saveSensors).not.toHaveBeenCalled();
    });
});

describe('SensorService 数据分发', () => {
    it('读响应匹配传感器并提取值', () => {
        const { service, emitter } = makeService();
        service.add(presetSensors.tempSensor);
        service.add(presetSensors.humiditySensor);

        const values = [];
        emitter.on('sensor-value', (payload) => values.push(payload));

        // 湿度 654（0x028E）= 65.4%，温度 265（0x0109）= 26.5°C
        service.handleReadResponse({
            slaveAddr: 0x03,
            funcCode: 0x03,
            value: [0x028E, 0x0109],
            rawData: '030304028E0109XXXX'
        });

        expect(values).toHaveLength(2);
        expect(values.find(v => v.sensorId === 'humiditySensor').value).toBe(65.4);
        expect(values.find(v => v.sensorId === 'tempSensor').value).toBe(26.5);
    });

    it('负温度（16位补码）正确解析', () => {
        const { service, emitter } = makeService();
        service.add(presetSensors.tempSensor);
        let received;
        emitter.on('sensor-value', (p) => { received = p; });

        // 温度 -5.0°C → 0xFFCE
        service.handleReadResponse({ slaveAddr: 0x03, funcCode: 0x03, value: [654, 0xFFCE], rawData: 'x' });
        expect(received.value).toBe(-5.0);
    });

    it('光照传感器按寄存器原始值提取', () => {
        const { service, emitter } = makeService();
        service.add(presetSensors.lightSensor);
        let received;
        emitter.on('sensor-value', (p) => { received = p; });

        service.handleReadResponse({ slaveAddr: 0x02, funcCode: 0x03, value: [300], rawData: 'x' });
        expect(received.value).toBe(300);
    });

    it('不匹配的响应被忽略', () => {
        const { service, emitter } = makeService();
        service.add(presetSensors.lightSensor);
        const listener = vi.fn();
        emitter.on('sensor-value', listener);

        service.handleReadResponse({ slaveAddr: 0x99, funcCode: 0x03, value: [1], rawData: 'x' });
        expect(listener).not.toHaveBeenCalled();
    });

    it('异常响应通知匹配的传感器', () => {
        const { service, emitter } = makeService();
        service.add(presetSensors.lightSensor);
        let received;
        emitter.on('sensor-error', (p) => { received = p; });

        service.handleException({ slaveAddr: 0x02, funcCode: 0x83, exceptionMessage: '非法数据地址', rawData: 'x' });
        expect(received.sensorId).toBe('lightSensor');
        expect(received.message).toBe('非法数据地址');
    });
});
