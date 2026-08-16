// ============================================================================
// UI 层：执行器卡片视图
// 依赖方向：view → service（查询/操作）、emitter（事件订阅）
// ============================================================================

function hex2(addr) {
    return '0x' + addr.toString(16).padStart(2, '0').toUpperCase();
}

function hex4(addr) {
    return '0x' + addr.toString(16).padStart(4, '0').toUpperCase();
}

export function createActuatorView({ container, service, emitter, onRemove }) {
    const configs = new Map();

    emitter.on('actuator-added', render);
    emitter.on('actuator-removed', (id) => {
        configs.delete(id);
        document.getElementById(id)?.remove();
    });
    emitter.on('actuator-state', ({ actuatorId, state }) => {
        updateButton(actuatorId, state);
    });
    emitter.on('actuator-confirm', ({ actuator, data }) => {
        showConfirm(actuator, data);
    });

    /**
     * 渲染执行器卡片
     * @param {{id:string, name:string, slaveAddr:number, funcCode:number, startReg:number}} config
     */
    function render(config) {
        if (configs.has(config.id)) return;
        configs.set(config.id, config);

        const card = document.createElement('div');
        card.id = config.id;
        card.className = 'actuator-card';

        card.innerHTML = `
            <button class="delete-btn" type="button">×</button>
            <div class="actuator-card-header">
                <span class="actuator-dot" style="background:${config.color}"></span>
                <div class="actuator-card-title">
                    <h4>${config.name}</h4>
                    <span class="actuator-badge">从机 ${hex2(config.slaveAddr)}</span>
                </div>
            </div>
            <div class="actuator-meta">
                <div class="actuator-meta-item">
                    <span class="meta-label">功能码</span>
                    <span class="meta-value">${hex2(config.funcCode)}</span>
                </div>
                <div class="actuator-meta-item">
                    <span class="meta-label">起始寄存器</span>
                    <span class="meta-value">${hex4(config.startReg)}</span>
                </div>
            </div>
            <div class="actuator-status-row">
                <span class="status-label">当前状态</span>
                <span class="status-text" id="status_${config.id}">关闭</span>
            </div>
            <button class="toggle-btn off" type="button">${config.name} (关)</button>
        `;

        card.querySelector('.delete-btn').addEventListener('click', () => onRemove(config.id));
        card.querySelector('.toggle-btn').addEventListener('click', () => service.toggle(config.id));

        container.appendChild(card);
        updateButton(config.id, service.getState(config.id));
    }

    /**
     * 更新按钮与状态文字
     */
    function updateButton(actuatorId, state) {
        const config = configs.get(actuatorId);
        const btn = document.querySelector(`#${actuatorId} .toggle-btn`);
        const statusSpan = document.getElementById(`status_${actuatorId}`);
        if (!config || !btn || !statusSpan) return;

        const on = !!state;
        btn.textContent = `${config.name} (${on ? '开' : '关'})`;
        btn.className = `toggle-btn ${on ? 'on' : 'off'}`;
        statusSpan.textContent = on ? '开启' : '关闭';
        statusSpan.style.color = on ? '#27ae60' : '#e74c3c';
    }

    /**
     * 写响应确认：临时显示执行结果，3 秒后恢复
     */
    function showConfirm(actuator, data) {
        const statusSpan = document.getElementById(`status_${actuator.id}`);
        if (!statusSpan) return;

        const success = data.success !== false;
        statusSpan.textContent = success ? '执行成功' : '执行失败';
        statusSpan.style.color = success ? '#27ae60' : '#e74c3c';

        setTimeout(() => {
            const currentState = service.getState(actuator.id);
            statusSpan.textContent = currentState ? '开启' : '关闭';
            statusSpan.style.color = currentState ? '#27ae60' : '#e74c3c';
        }, 3000);
    }

    return { render };
}
