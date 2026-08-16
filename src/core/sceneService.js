// ============================================================================
// 核心层（用例层）：场景联动服务
// 职责：场景管理、条件判定、触发动作
// 依赖注入：actuatorService（执行器操作接口）、storage、emitter、log
// 依赖倒置：仅依赖 actuatorService 的 setTo/get 接口，不依赖具体实现
// ============================================================================

const CONDITION_MAP = {
    gt: '大于',
    lt: '小于',
    ge: '大于等于',
    le: '小于等于',
    eq: '等于',
    ne: '不等于'
};

function satisfies(sensorValue, condition, triggerValue) {
    switch (condition) {
        case 'gt': return sensorValue > triggerValue;
        case 'lt': return sensorValue < triggerValue;
        case 'ge': return sensorValue >= triggerValue;
        case 'le': return sensorValue <= triggerValue;
        case 'eq': return sensorValue === triggerValue;
        case 'ne': return sensorValue !== triggerValue;
        default: return false;
    }
}

export class SceneService {
    constructor({ actuatorService, storage, emitter, log = console }) {
        this.actuatorService = actuatorService;
        this.storage = storage;
        this.bus = emitter;
        this.log = log;
        this.scenes = [];
        this.sensorValues = {};
        this.counter = 1;

        // 订阅传感器值更新，触发场景判定（与 UI/服务解耦）
        this.bus.on('sensor-value', ({ sensorId, value }) => {
            this.onSensorValue(sensorId, value);
        });
    }

    list() {
        return this.scenes;
    }

    get(id) {
        return this.scenes.find(s => s.id === id);
    }

    /**
     * 添加场景（自动生成 id）
     * @param {{name:string, triggerSensor:string, triggerCondition:string, triggerValue:number,
     *          actionActuator:string, actionState:string, enabled:boolean}} input
     * @returns {Object} 创建的场景对象
     */
    add(input) {
        const scene = {
            id: `scene_${this.counter++}`,
            name: input.name,
            triggerSensor: input.triggerSensor,
            triggerCondition: input.triggerCondition,
            triggerValue: input.triggerValue,
            actionActuator: input.actionActuator,
            actionState: input.actionState,
            enabled: input.enabled !== false
        };
        this.scenes.push(scene);
        this.persist();
        this.bus.emit('scene-added', scene);
        return scene;
    }

    remove(id) {
        this.scenes = this.scenes.filter(s => s.id !== id);
        this.persist();
        this.bus.emit('scene-removed', id);
    }

    /**
     * 切换场景启用/停用
     * @returns {boolean}
     */
    toggleEnabled(id) {
        const scene = this.get(id);
        if (!scene) return false;
        scene.enabled = !scene.enabled;
        this.persist();
        this.bus.emit('scene-updated', scene);
        return true;
    }

    onSensorValue(sensorId, value) {
        this.sensorValues[sensorId] = value;
        this.checkTriggers();
    }

    /**
     * 遍历场景，条件满足时触发动作
     */
    checkTriggers() {
        this.scenes.forEach(scene => {
            if (!scene.enabled) return;
            const sensorValue = this.sensorValues[scene.triggerSensor];
            if (sensorValue === undefined) return;
            if (satisfies(sensorValue, scene.triggerCondition, scene.triggerValue)) {
                this.execute(scene);
            }
        });
    }

    /**
     * 执行场景动作（状态相同则不重复发送命令）
     */
    execute(scene) {
        const actuator = this.actuatorService.get(scene.actionActuator);
        if (!actuator) return;
        const targetState = scene.actionState === 'on';
        if (this.actuatorService.setTo(actuator.id, targetState)) {
            this.log.log(`场景联动触发: ${scene.name} → ${actuator.name} ${targetState ? '开启' : '关闭'}`);
        }
    }

    /**
     * 场景条件的中文描述（供 UI 展示）
     */
    describe(scene, sensorLookup, actuatorLookup) {
        const sensor = sensorLookup(scene.triggerSensor);
        const actuator = actuatorLookup(scene.actionActuator);
        const conditionText = `${sensor?.name || '未知传感器'} ${CONDITION_MAP[scene.triggerCondition]} ${scene.triggerValue} ${sensor?.unit || ''}`;
        const actionText = `${actuator?.name || '未知设备'} → ${scene.actionState === 'on' ? '开启' : '关闭'}`;
        return { conditionText, actionText };
    }

    loadFromCache() {
        this.scenes = this.storage.loadScenes();
        this.counter = this.scenes.reduce((max, s) => {
            const num = parseInt(String(s.id).replace(/^scene_/, ''), 10);
            return Number.isFinite(num) ? Math.max(max, num + 1) : max;
        }, 1);
        return this.scenes;
    }

    persist() {
        this.storage.saveScenes(this.scenes);
    }
}
