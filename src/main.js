// ============================================================================
// 装配根（Composition Root）：依赖注入与事件接线
// 依赖方向：框架层（main）→ 适配层 → 用例层 → 实体层
// ============================================================================

import './style.css';
import { createEmitter } from './core/emitter.js';
import { parseModbusRTU } from './core/modbus.js';
import { SensorService } from './core/sensorService.js';
import { ActuatorService } from './core/actuatorService.js';
import { SceneService } from './core/sceneService.js';
import { MqttGateway } from './adapters/mqttGateway.js';
import * as storage from './adapters/storage.js';
import { createSensorView } from './ui/sensorView.js';
import { createActuatorView } from './ui/actuatorView.js';
import { createSceneView } from './ui/sceneView.js';
import { createModals } from './ui/modals.js';

const bus = createEmitter();

// ---- 适配层 ----
const mqtt = new MqttGateway({
    onStatusChange: (status) => {
        document.getElementById('connectionStatus').textContent = `连接状态：${status}`;
    },
    onRawMessage: handleMessage
});

// ---- 用例层（依赖注入）----
const sensorService = new SensorService({ mqttGateway: mqtt, storage, emitter: bus });
const actuatorService = new ActuatorService({ mqttGateway: mqtt, storage, emitter: bus });
const sceneService = new SceneService({ actuatorService, storage, emitter: bus });

// ---- UI 层 ----
const modals = createModals({ sensorService, actuatorService, sceneService });

createSensorView({
    container: document.getElementById('sensorContainer'),
    emitter: bus,
    onRemove: (id) => {
        const sensor = sensorService.get(id);
        modals.confirm(`确定要删除传感器"${sensor?.name ?? id}"吗？`, (ok) => {
            if (ok) sensorService.remove(id);
        });
    }
});

createActuatorView({
    container: document.getElementById('actuatorContainer'),
    service: actuatorService,
    emitter: bus,
    onRemove: (id) => {
        const actuator = actuatorService.get(id);
        modals.confirm(`确定要删除执行器"${actuator?.name ?? id}"吗？`, (ok) => {
            if (ok) actuatorService.remove(id);
        });
    }
});

createSceneView({
    container: document.getElementById('sceneContainer'),
    service: sceneService,
    emitter: bus,
    lookupSensor: (id) => sensorService.get(id),
    lookupActuator: (id) => actuatorService.get(id),
    onRemove: (id) => {
        const scene = sceneService.get(id);
        modals.confirm(`确定要删除场景联动"${scene?.name ?? id}"吗？`, (ok) => {
            if (ok) sceneService.remove(id);
        });
    },
    onToggle: (id) => sceneService.toggleEnabled(id)
});

// ---- 消息分发（适配层 → 协议层 → 用例层）----
const READ_TYPES = new Set(['coils', 'inputs', 'holdingRegisters', 'inputRegisters']);
const WRITE_TYPES = new Set(['writeCoil', 'writeCoils', 'writeRegister', 'writeRegisters']);

function handleModbusResponse(result) {
    if (READ_TYPES.has(result.type)) {
        sensorService.handleReadResponse(result);
    } else if (WRITE_TYPES.has(result.type)) {
        actuatorService.handleWriteResponse(result);
    } else if (result.type === 'exception') {
        sensorService.handleException(result);
    } else {
        console.error(`未知功能码响应: 0x${result.funcCode.toString(16)}`);
    }
}

function handleMessage(hexData) {
    const result = parseModbusRTU(hexData);
    if (!result.valid) {
        console.error(`Modbus RTU 数据错误: ${result.error}`);
        return;
    }
    handleModbusResponse(result);
}

// ---- 初始化（loadFromCache 直接填充数据，不触发事件；此处手动发布渲染事件）----
sensorService.loadFromCache().forEach(config => bus.emit('sensor-added', config));
actuatorService.loadFromCache().forEach(config => bus.emit('actuator-added', config));
sceneService.loadFromCache().forEach(scene => bus.emit('scene-added', scene));
mqtt.connect();
