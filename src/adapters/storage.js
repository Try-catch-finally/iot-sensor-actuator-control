// ============================================================================
// 适配器层：本地存储（localStorage 封装）
// 职责：序列化/反序列化业务数据。上层不直接接触 localStorage API
// 依赖方向：适配器 → 无；业务层通过本模块持久化
// ============================================================================

const KEYS = {
    SENSORS: 'activeSensors',
    CUSTOM_SENSORS: 'customSensors',
    ACTUATORS: 'actuatorCache',
    SCENES: 'scenes'
};

function read(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        console.error(`读取缓存失败 [${key}]:`, e);
        return fallback;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`保存缓存失败 [${key}]:`, e);
    }
}

/**
 * 传感器：存储活动传感器 ID 数组 + 自定义传感器纯数据配置
 */
export function saveSensors(sensorIds, customSensors) {
    write(KEYS.SENSORS, sensorIds);
    write(KEYS.CUSTOM_SENSORS, customSensors);
}

/**
 * @returns {{hasCache:boolean, sensorIds:string[], customSensors:Object}} 纯数据字段（无函数）
 */
export function loadSensors() {
    const sensorIds = read(KEYS.SENSORS, null);
    if (sensorIds === null) {
        return { hasCache: false, sensorIds: [], customSensors: {} };
    }
    return {
        hasCache: true,
        sensorIds,
        customSensors: read(KEYS.CUSTOM_SENSORS, {})
    };
}

/**
 * 执行器：存储配置列表 + 状态表（均为纯数据）
 */
export function saveActuators(actuators, states) {
    write(KEYS.ACTUATORS, { activeActuators: actuators, actuatorStates: states });
}

export function loadActuators() {
    const data = read(KEYS.ACTUATORS, null);
    if (data && Array.isArray(data.activeActuators)) {
        return { actuators: data.activeActuators, states: data.actuatorStates || {} };
    }
    return { actuators: null, states: {} };
}

/**
 * 场景联动
 */
export function saveScenes(scenes) {
    write(KEYS.SCENES, scenes);
}

export function loadScenes() {
    return read(KEYS.SCENES, []);
}
