// ============================================================================
// UI 层：传感器卡片视图（只读渲染，不包含业务逻辑）
// 依赖方向：view → service（查询）、emitter（事件订阅）
// ============================================================================

import { formatSensorValue } from './format.js';

function hex2(addr) {
    return '0x' + addr.toString(16).padStart(2, '0').toUpperCase();
}

export function createSensorView({ container, emitter, onRemove }) {
    const configs = new Map();

    emitter.on('sensor-added', render);
    emitter.on('sensor-removed', (id) => {
        configs.delete(id);
        document.getElementById(id)?.remove();
    });
    emitter.on('sensor-value', ({ sensorId, value, rawData }) => {
        update(sensorId, value, rawData);
    });
    emitter.on('sensor-error', ({ sensorId, message, rawData }) => {
        showError(sensorId, message, rawData);
    });

    /**
     * 渲染传感器卡片
     * @param {{id:string, name:string, label:string, unit:string, color:string, request:Object}} config
     */
    function render(config) {
        if (configs.has(config.id)) return;
        configs.set(config.id, config);

        const card = document.createElement('div');
        card.id = config.id;
        card.className = 'sensor-box';

        card.innerHTML = `
            <button class="delete-btn" type="button">×</button>
            <div class="sensor-card-header">
                <span class="sensor-dot" style="background:${config.color};"></span>
                <div class="sensor-card-title">
                    <h4>${config.name}</h4>
                    <span class="sensor-badge">从机 ${hex2(config.request.slaveAddr)}</span>
                </div>
            </div>
            <div class="actuator-meta">
                <div class="actuator-meta-item">
                    <span class="meta-label">功能码</span>
                    <span class="meta-value">${hex2(config.request.funcCode)}</span>
                </div>
                <div class="actuator-meta-item">
                    <span class="meta-label">起始寄存器</span>
                    <span class="meta-value">${hex2(config.request.startReg)}</span>
                </div>
            </div>
            <div class="sensor-value-block">
                <span class="sensor-value-label">${config.label}</span>
                <span class="sensor-value" style="color:${config.color};">--.- ${config.unit}</span>
            </div>
            <div class="actuator-status-row">
                <span class="status-label">原始数据</span>
                <span class="status-text">等待接收数据...</span>
            </div>
        `;

        card.querySelector('.delete-btn').addEventListener('click', () => onRemove(config.id));
        container.appendChild(card);
    }

    /**
     * 更新卡片数值与原始数据
     */
    function update(sensorId, value, rawData) {
        const config = configs.get(sensorId);
        const card = document.getElementById(sensorId);
        if (!config || !card) return;

        const valueSpan = card.querySelector('.sensor-value');
        if (valueSpan) {
            valueSpan.textContent = formatSensorValue(value, config.unit);
            valueSpan.style.color = config.color;
            valueSpan.classList.add('value-update');
            setTimeout(() => valueSpan.classList.remove('value-update'), 500);
        }

        const statusSpan = card.querySelector('.status-text');
        if (statusSpan) {
            statusSpan.textContent = rawData;
        }
    }

    /**
     * 异常响应：卡片显示异常状态
     */
    function showError(sensorId, message, rawData) {
        const card = document.getElementById(sensorId);
        if (!card) return;

        const valueSpan = card.querySelector('.sensor-value');
        if (valueSpan) {
            valueSpan.textContent = '异常';
            valueSpan.style.color = '#e74c3c';
        }
        const statusSpan = card.querySelector('.status-text');
        if (statusSpan) {
            statusSpan.textContent = `异常: ${message} (${rawData})`;
        }
    }

    return { render };
}
