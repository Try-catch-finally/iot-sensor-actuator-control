// ============================================================================
// 实体层：静态配置与领域规则（纯数据 + 纯函数，无副作用）
// 职责：传感器/执行器预设配置、传感器值提取规则
// 开闭原则：新增传感器/执行器类型只需在此添加配置，无需修改协议/服务层
// ============================================================================

// ---- MQTT 配置（从 .env 读取，避免敏感凭据进入源码/仓库）----
// 复制 .env.example 为 .env 并填写实际值；未配置时使用非敏感默认
const env = import.meta.env || {};
export const mqttConfig = {
    server: env.VITE_MQTT_SERVER || '127.0.0.1',
    port: Number(env.VITE_MQTT_PORT || 8083),
    subscribeTopic: env.VITE_MQTT_SUBSCRIBE_TOPIC || 'usr/sensor',
    publishTopic: env.VITE_MQTT_PUBLISH_TOPIC || 'usr/actuator',
    username: env.VITE_MQTT_USERNAME || '',
    password: env.VITE_MQTT_PASSWORD || '',
    useSSL: env.VITE_MQTT_USE_SSL === 'true'
};

/**
 * 默认值提取：单寄存器返回数字，多寄存器返回数组
 * @param {number[]} registers
 * @returns {number|number[]}
 */
const defaultExtract = (registers) => (registers.length === 1 ? registers[0] : registers);

/**
 * 无符号寄存器转有符号（16位补码）
 */
const toSigned16 = (value) => (value > 32767 ? value - 65536 : value);

/** 传感器请求共享配置（tempSensor 与 humiditySensor 共用同一 Modbus 请求） */
const TEMP_HUMIDITY_REQUEST = {
    slaveAddr: 0x03,
    funcCode: 0x03,
    startReg: 0x0000,
    regCount: 2,
    interval: 5000
};

// ---- 传感器预设 ----
export const presetSensors = {
    lightSensor: {
        id: 'lightSensor',
        name: '光照传感器',
        label: '光照强度',
        unit: 'lux',
        color: '#f39c12',
        valueType: 'light',
        request: { slaveAddr: 0x02, funcCode: 0x03, startReg: 0x0002, regCount: 1, interval: 6000 },
        extractValue: (regs) => regs[0]
    },
    tempSensor: {
        id: 'tempSensor',
        name: '温度传感器',
        label: '温度',
        unit: '°C',
        color: '#e74c3c',
        valueType: 'temperature',
        request: TEMP_HUMIDITY_REQUEST,
        extractValue: (regs) => toSigned16(regs[1]) / 10
    },
    humiditySensor: {
        id: 'humiditySensor',
        name: '湿度传感器',
        label: '湿度',
        unit: '%',
        color: '#3498db',
        valueType: 'humidity',
        request: TEMP_HUMIDITY_REQUEST,
        extractValue: (regs) => regs[0] / 10
    },
    noiseSensor: {
        id: 'noiseSensor',
        name: '噪声传感器',
        label: '噪声等级',
        unit: 'dB',
        color: '#9b59b6',
        valueType: 'noise',
        request: { slaveAddr: 0x04, funcCode: 0x03, startReg: 0x0006, regCount: 1, interval: 7000 },
        extractValue: (regs) => regs[0] / 10
    },
    pressureSensor: {
        id: 'pressureSensor',
        name: '压力传感器',
        label: '压力',
        unit: 'kPa',
        color: '#e67e22',
        valueType: 'pressure',
        request: { slaveAddr: 0x05, funcCode: 0x03, startReg: 0x0000, regCount: 2, interval: 8000 }
    },
    co2Sensor: {
        id: 'co2Sensor',
        name: 'CO2传感器',
        label: 'CO2浓度',
        unit: 'ppm',
        color: '#1abc9c',
        valueType: 'co2',
        request: { slaveAddr: 0x06, funcCode: 0x03, startReg: 0x0000, regCount: 1, interval: 10000 }
    },
    waterLevelSensor: {
        id: 'waterLevelSensor',
        name: '水位传感器',
        label: '水位',
        unit: 'm',
        color: '#00cec9',
        valueType: 'waterLevel',
        request: { slaveAddr: 0x07, funcCode: 0x03, startReg: 0x0000, regCount: 2, interval: 9000 }
    },
    flowSensor: {
        id: 'flowSensor',
        name: '流量传感器',
        label: '流量',
        unit: 'L/min',
        color: '#6c5ce7',
        valueType: 'flow',
        request: { slaveAddr: 0x08, funcCode: 0x03, startReg: 0x0000, regCount: 2, interval: 6000 }
    },
    vibrationSensor: {
        id: 'vibrationSensor',
        name: '振动传感器',
        label: '振动',
        unit: 'g',
        color: '#fd79a8',
        valueType: 'vibration',
        request: { slaveAddr: 0x09, funcCode: 0x03, startReg: 0x0000, regCount: 1, interval: 5000 }
    },
    voltageSensor: {
        id: 'voltageSensor',
        name: '电压传感器',
        label: '电压',
        unit: 'V',
        color: '#fdcb6e',
        valueType: 'voltage',
        request: { slaveAddr: 0x0A, funcCode: 0x04, startReg: 0x0000, regCount: 1, interval: 4000 }
    },
    currentSensor: {
        id: 'currentSensor',
        name: '电流传感器',
        label: '电流',
        unit: 'A',
        color: '#e17055',
        valueType: 'current',
        request: { slaveAddr: 0x0B, funcCode: 0x04, startReg: 0x0000, regCount: 1, interval: 4000 }
    },
    smokeSensor: {
        id: 'smokeSensor',
        name: '烟雾传感器',
        label: '烟雾浓度',
        unit: 'level',
        color: '#d63031',
        valueType: 'smoke',
        request: { slaveAddr: 0x0C, funcCode: 0x01, startReg: 0x0000, regCount: 1, interval: 5000 },
        extractValue: (bits) => bits[0]
    },
    irSensor: {
        id: 'irSensor',
        name: '红外传感器',
        label: '红外状态',
        unit: 'state',
        color: '#a29bfe',
        valueType: 'ir',
        request: { slaveAddr: 0x0D, funcCode: 0x02, startReg: 0x0000, regCount: 1, interval: 3000 },
        extractValue: (bits) => bits[0]
    },
    ultrasonicSensor: {
        id: 'ultrasonicSensor',
        name: '超声波传感器',
        label: '距离',
        unit: 'cm',
        color: '#74b9ff',
        valueType: 'ultrasonic',
        request: { slaveAddr: 0x0E, funcCode: 0x03, startReg: 0x0000, regCount: 2, interval: 6000 }
    },
    phSensor: {
        id: 'phSensor',
        name: 'pH传感器',
        label: 'pH值',
        unit: 'pH',
        color: '#55efc4',
        valueType: 'ph',
        request: { slaveAddr: 0x0F, funcCode: 0x03, startReg: 0x0000, regCount: 2, interval: 8000 }
    }
};

// ---- 执行器预设 ----
export const presetActuators = {
    doorLock: {
        id: 'actuator_doorLock',
        name: '门锁',
        slaveAddr: 0x01,
        funcCode: 0x05,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#e74c3c'
    },
    alarmLight: {
        id: 'actuator_alarmLight',
        name: '报警灯',
        slaveAddr: 0x01,
        funcCode: 0x05,
        startReg: 0x0001,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#f39c12'
    },
    fan: {
        id: 'actuator_fan',
        name: '风扇',
        slaveAddr: 0x01,
        funcCode: 0x05,
        startReg: 0x0002,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#3498db'
    },
    relay: {
        id: 'actuator_relay',
        name: '继电器',
        slaveAddr: 0x02,
        funcCode: 0x05,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#9b59b6'
    },
    solenoidValve: {
        id: 'actuator_solenoidValve',
        name: '电磁阀',
        slaveAddr: 0x02,
        funcCode: 0x05,
        startReg: 0x0001,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#1abc9c'
    },
    ledLight: {
        id: 'actuator_ledLight',
        name: 'LED灯',
        slaveAddr: 0x01,
        funcCode: 0x05,
        startReg: 0x0003,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#00cec9'
    },
    motor: {
        id: 'actuator_motor',
        name: '电机',
        slaveAddr: 0x03,
        funcCode: 0x06,
        startReg: 0x0001,
        regCount: 1,
        writeValue: 0x0001,
        color: '#e67e22'
    },
    heater: {
        id: 'actuator_heater',
        name: '加热器',
        slaveAddr: 0x04,
        funcCode: 0x05,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#d63031'
    },
    cooler: {
        id: 'actuator_cooler',
        name: '冷却器',
        slaveAddr: 0x04,
        funcCode: 0x05,
        startReg: 0x0001,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#0984e3'
    },
    buzzer: {
        id: 'actuator_buzzer',
        name: '蜂鸣器',
        slaveAddr: 0x05,
        funcCode: 0x05,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#fd79a8'
    },
    servoMotor: {
        id: 'actuator_servoMotor',
        name: '伺服电机',
        slaveAddr: 0x05,
        funcCode: 0x06,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0x005A,
        color: '#6c5ce7'
    },
    stepperMotor: {
        id: 'actuator_stepperMotor',
        name: '步进电机',
        slaveAddr: 0x06,
        funcCode: 0x10,
        startReg: 0x0000,
        regCount: 2,
        writeValue: 0x0001,
        color: '#a29bfe'
    },
    waterPump: {
        id: 'actuator_waterPump',
        name: '水泵',
        slaveAddr: 0x06,
        funcCode: 0x05,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#74b9ff'
    },
    airPump: {
        id: 'actuator_airPump',
        name: '气泵',
        slaveAddr: 0x07,
        funcCode: 0x05,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#55efc4'
    },
    electromagnet: {
        id: 'actuator_electromagnet',
        name: '电磁铁',
        slaveAddr: 0x07,
        funcCode: 0x06,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0x0001,
        color: '#fdcb6e'
    },
    heatingPlate: {
        id: 'actuator_heatingPlate',
        name: '加热板',
        slaveAddr: 0x08,
        funcCode: 0x05,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0xFF00,
        color: '#e17055'
    },
    coolingFan: {
        id: 'actuator_coolingFan',
        name: '冷却风扇',
        slaveAddr: 0x08,
        funcCode: 0x06,
        startReg: 0x0000,
        regCount: 1,
        writeValue: 0x0001,
        color: '#00b894'
    }
};

/**
 * 请求去重键：相同从机地址+功能码+起始地址+数量的请求合并为一个轮询定时器
 * @param {{slaveAddr:number, funcCode:number, startReg:number, regCount:number}} request
 * @returns {string}
 */
export function requestKey(request) {
    return `${request.slaveAddr}_${request.funcCode}_${request.startReg}_${request.regCount}`;
}

/**
 * 默认值提取（供自定义传感器使用）
 */
export { defaultExtract };

/**
 * 自定义传感器创建工厂：从表单参数生成传感器配置
 */
export function createCustomSensor({ name, slaveAddr, funcCode, startReg, regCount, unit, interval, color }) {
    return {
        id: 'sensor_' + Date.now(),
        name,
        label: '数值',
        unit,
        color,
        valueType: 'custom',
        isCustom: true,
        request: { slaveAddr, funcCode, startReg, regCount, interval },
        extractValue: defaultExtract
    };
}

/**
 * 自定义执行器创建工厂：从表单参数生成执行器配置
 */
export function createCustomActuator({ name, slaveAddr, funcCode, startReg, regCount, writeValue }) {
    return {
        id: 'actuator_custom_' + Date.now(),
        name,
        slaveAddr,
        funcCode,
        startReg,
        regCount,
        writeValue,
        color: '#9b59b6'
    };
}
