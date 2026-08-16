// ============================================================================
// 单元测试：场景联动服务（条件判定、触发、依赖注入）
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneService } from '../src/core/sceneService.js';
import { createEmitter } from '../src/core/emitter.js';

const fakeStorage = {
    saveScenes: vi.fn(),
    loadScenes: vi.fn(() => [])
};

function makeService(actuatorMock) {
    const emitter = createEmitter();
    const actuatorService = actuatorMock || {
        get: vi.fn(() => ({ id: 'actuator_fan', name: '风扇' })),
        setTo: vi.fn(() => true)
    };
    const service = new SceneService({
        actuatorService,
        storage: fakeStorage,
        emitter,
        log: { log: vi.fn() }
    });
    return { service, emitter, actuatorService };
}

function addScene(service, overrides = {}) {
    return service.add({
        name: '测试场景',
        triggerSensor: 'lightSensor',
        triggerCondition: 'gt',
        triggerValue: 100,
        actionActuator: 'actuator_fan',
        actionState: 'on',
        enabled: true,
        ...overrides
    });
}

describe('SceneService 场景管理', () => {
    beforeEach(() => {
        fakeStorage.saveScenes.mockClear();
    });

    it('添加场景：自动生成 id 并持久化', () => {
        const { service } = makeService();
        const scene = addScene(service);
        expect(scene.id).toBe('scene_1');
        expect(service.list()).toHaveLength(1);
        expect(fakeStorage.saveScenes).toHaveBeenCalled();
    });

    it('删除场景', () => {
        const { service } = makeService();
        const scene = addScene(service);
        service.remove(scene.id);
        expect(service.list()).toHaveLength(0);
    });

    it('切换启用状态', () => {
        const { service } = makeService();
        const scene = addScene(service);
        expect(service.toggleEnabled(scene.id)).toBe(true);
        expect(scene.enabled).toBe(false);
        expect(service.toggleEnabled('nonexistent')).toBe(false);
    });
});

describe('SceneService 条件判定与触发', () => {
    it('大于条件满足时触发执行器', () => {
        const { service, actuatorService } = makeService();
        addScene(service, { triggerCondition: 'gt', triggerValue: 100 });
        service.onSensorValue('lightSensor', 200);
        expect(actuatorService.setTo).toHaveBeenCalledWith('actuator_fan', true);
    });

    it('条件不满足时不触发', () => {
        const { service, actuatorService } = makeService();
        addScene(service, { triggerCondition: 'gt', triggerValue: 100 });
        service.onSensorValue('lightSensor', 50);
        expect(actuatorService.setTo).not.toHaveBeenCalled();
    });

    it.each([
        ['gt', 101, true], ['gt', 100, false],
        ['lt', 99, true], ['lt', 100, false],
        ['ge', 100, true], ['ge', 99, false],
        ['le', 100, true], ['le', 101, false],
        ['eq', 100, true], ['eq', 101, false],
        ['ne', 101, true], ['ne', 100, false]
    ])('条件 %s 值 %i → 触发=%s', (condition, value, expected) => {
        const { service, actuatorService } = makeService();
        addScene(service, { triggerCondition: condition, triggerValue: 100 });
        service.onSensorValue('lightSensor', value);
        expect(actuatorService.setTo).toHaveBeenCalledTimes(expected ? 1 : 0);
    });

    it('停用的场景不触发', () => {
        const { service, actuatorService } = makeService();
        addScene(service, { enabled: false });
        service.onSensorValue('lightSensor', 200);
        expect(actuatorService.setTo).not.toHaveBeenCalled();
    });

    it('传感器无值时跳过判定', () => {
        const { service, actuatorService } = makeService();
        addScene(service);
        service.onSensorValue('otherSensor', 200);
        expect(actuatorService.setTo).not.toHaveBeenCalled();
    });

    it('执行器状态相同时不发送命令（setTo 返回 false）', () => {
        const log = vi.fn();
        const emitter = createEmitter();
        const actuatorService = {
            get: vi.fn(() => ({ id: 'actuator_fan', name: '风扇' })),
            setTo: vi.fn(() => false) // 状态未变化
        };
        const service = new SceneService({ actuatorService, storage: fakeStorage, emitter, log });
        addScene(service);
        service.onSensorValue('lightSensor', 200);
        expect(log).not.toHaveBeenCalled();
    });

    it('动作目标为关闭时传 false', () => {
        const { service, actuatorService } = makeService();
        addScene(service, { actionState: 'off' });
        service.onSensorValue('lightSensor', 200);
        expect(actuatorService.setTo).toHaveBeenCalledWith('actuator_fan', false);
    });
});
