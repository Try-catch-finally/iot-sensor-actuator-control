// ============================================================================
// UI 层：弹窗与表单交互
// 职责：弹窗开合、删除确认、传感器/执行器/场景表单提交
// 依赖方向：view → service（业务操作）、entities（预设配置）
// ============================================================================

import { presetSensors, presetActuators, createCustomSensor, createCustomActuator } from '../entities/presets.js';

const UNIT_COLORS = {
    'lux': '#f39c12',
    '°C': '#e74c3c',
    '%': '#3498db',
    'dB': '#9b59b6'
};

export function createModals({ sensorService, actuatorService, sceneService }) {
    const overlay = document.getElementById('modalOverlay');
    const modal = {
        add: document.getElementById('addModal'),
        sensor: document.getElementById('sensorModal'),
        actuator: document.getElementById('actuatorModal'),
        scene: document.getElementById('sceneModal'),
        confirm: document.getElementById('confirmModal')
    };

    function open(target) {
        overlay.classList.add('show');
        target.classList.add('show');
    }

    function close() {
        overlay.classList.remove('show');
        Object.values(modal).forEach(m => m.classList.remove('show'));
    }

    /**
     * 自定义确认弹窗
     */
    function confirm(message, callback) {
        document.getElementById('confirmMessage').textContent = message;
        open(modal.confirm);
        document.querySelector('.confirm-yes').onclick = () => {
            close();
            callback(true);
        };
        document.querySelector('.confirm-no').onclick = () => {
            close();
            callback(false);
        };
    }

    // ---------- 场景下拉选项刷新 ----------
    function updateSceneSelects() {
        const trigger = document.getElementById('triggerSensor');
        const action = document.getElementById('actionActuator');
        trigger.innerHTML = '<option value="">-- 请选择传感器 --</option>';
        action.innerHTML = '<option value="">-- 请选择执行器 --</option>';

        sensorService.list().forEach(sensor => {
            const option = document.createElement('option');
            option.value = sensor.id;
            option.textContent = `${sensor.name} (从机地址: 0x${sensor.request.slaveAddr.toString(16).toUpperCase()})`;
            trigger.appendChild(option);
        });

        actuatorService.list().forEach(actuator => {
            const option = document.createElement('option');
            option.value = actuator.id;
            option.textContent = `${actuator.name} (从机地址: 0x${actuator.slaveAddr.toString(16).toUpperCase()})`;
            action.appendChild(option);
        });
    }

    // ---------- 传感器表单 ----------
    function fillSensorForm() {
        const type = document.getElementById('sensorType').value;
        const preset = presetSensors[type];
        if (preset) {
            document.getElementById('sensorName').value = preset.name;
            document.getElementById('slaveAddr').value = '0x' + preset.request.slaveAddr.toString(16).padStart(2, '0').toUpperCase();
            document.getElementById('funcCode').value = '0x' + preset.request.funcCode.toString(16).padStart(2, '0').toUpperCase();
            document.getElementById('startReg').value = '0x' + preset.request.startReg.toString(16).padStart(4, '0').toUpperCase();
            document.getElementById('regCount').value = preset.request.regCount;
            document.getElementById('dataUnit').value = preset.unit;
            document.getElementById('requestInterval').value = preset.request.interval;
        } else {
            document.getElementById('sensorForm').reset();
            document.getElementById('sensorType').value = type;
        }
    }

    function setupSensorForm() {
        const form = document.getElementById('sensorForm');
        document.getElementById('sensorType').addEventListener('change', fillSensorForm);

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const type = document.getElementById('sensorType').value;
            const name = document.getElementById('sensorName').value.trim();
            if (!type) return alert('请选择传感器类型');
            if (!name) return alert('请输入传感器名称');

            const slaveAddr = parseInt(document.getElementById('slaveAddr').value, 16);
            const funcCode = parseInt(document.getElementById('funcCode').value, 16);
            const startReg = parseInt(document.getElementById('startReg').value, 16);
            const regCount = parseInt(document.getElementById('regCount').value);
            const unit = document.getElementById('dataUnit').value;
            const interval = parseInt(document.getElementById('requestInterval').value);

            const config = type === 'custom'
                ? createCustomSensor({ name, slaveAddr, funcCode, startReg, regCount, unit, interval, color: UNIT_COLORS[unit] || '#3498db' })
                : presetSensors[type];

            if (sensorService.has(config.id)) return alert('该传感器已存在');

            sensorService.add(config);
            form.reset();
            close();
        });
    }

    // ---------- 执行器表单 ----------
    function fillActuatorForm() {
        const type = document.getElementById('actuatorType').value;
        const writeValueInput = document.getElementById('actuatorWriteValue');
        const preset = presetActuators[type];

        if (preset) {
            document.getElementById('actuatorName').value = preset.name;
            document.getElementById('actuatorSlaveAddr').value = '0x' + preset.slaveAddr.toString(16).padStart(2, '0').toUpperCase();
            document.getElementById('actuatorFuncCode').value = '0x' + preset.funcCode.toString(16).padStart(2, '0').toUpperCase();
            document.getElementById('actuatorStartReg').value = '0x' + preset.startReg.toString(16).padStart(4, '0').toUpperCase();
            document.getElementById('actuatorRegCount').value = preset.regCount;
            writeValueInput.value = '0x' + preset.writeValue.toString(16).padStart(4, '0').toUpperCase();
            writeValueInput.disabled = true;
        } else {
            document.getElementById('actuatorForm').reset();
            document.getElementById('actuatorType').value = type;
            writeValueInput.disabled = false;
            writeValueInput.value = '0xFF00';
        }
    }

    function setupActuatorForm() {
        const form = document.getElementById('actuatorForm');
        document.getElementById('actuatorType').addEventListener('change', fillActuatorForm);

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const type = document.getElementById('actuatorType').value;
            const name = document.getElementById('actuatorName').value.trim();
            if (!type || !name) return alert('请选择执行器类型并输入名称');

            const slaveAddr = parseInt(document.getElementById('actuatorSlaveAddr').value, 16);
            const funcCode = parseInt(document.getElementById('actuatorFuncCode').value, 16);
            const startReg = parseInt(document.getElementById('actuatorStartReg').value, 16);
            const regCount = parseInt(document.getElementById('actuatorRegCount').value);
            const writeValue = parseInt(document.getElementById('actuatorWriteValue').value, 16);

            const config = type === 'custom'
                ? createCustomActuator({ name, slaveAddr, funcCode, startReg, regCount, writeValue })
                : presetActuators[type];

            if (actuatorService.has(config.id)) return alert('该执行器已存在');

            actuatorService.add(config);
            form.reset();
            document.getElementById('actuatorWriteValue').disabled = false;
            close();
        });
    }

    // ---------- 场景表单 ----------
    function setupSceneForm() {
        const form = document.getElementById('sceneForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            sceneService.add({
                name: document.getElementById('sceneName').value,
                triggerSensor: document.getElementById('triggerSensor').value,
                triggerCondition: document.getElementById('triggerCondition').value,
                triggerValue: parseFloat(document.getElementById('triggerValue').value),
                actionActuator: document.getElementById('actionActuator').value,
                actionState: document.getElementById('actionState').value,
                enabled: document.getElementById('sceneEnabled').value === 'true'
            });
            form.reset();
            close();
        });
    }

    // ---------- 初始化绑定 ----------
    function openSensorModal() {
        open(modal.sensor);
        updateSceneSelects();
    }

    function openActuatorModal() {
        open(modal.actuator);
    }

    function openSceneModal() {
        open(modal.scene);
        updateSceneSelects();
    }

    function init() {
        document.querySelector('.float-add-btn').addEventListener('click', () => open(modal.add));
        document.querySelectorAll('.modal-close, [data-close]').forEach(btn => btn.addEventListener('click', close));
        overlay.addEventListener('click', close);
        document.querySelectorAll('.modal-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                close();
                const target = btn.dataset.open;
                if (target === 'sensor') openSensorModal();
                else if (target === 'actuator') openActuatorModal();
                else if (target === 'scene') openSceneModal();
            });
        });
        setupSensorForm();
        setupActuatorForm();
        setupSceneForm();
    }

    init();

    return {
        close,
        confirm,
        openAdd: () => open(modal.add),
        openSensor: openSensorModal,
        openActuator: openActuatorModal,
        openScene: openSceneModal
    };
}
