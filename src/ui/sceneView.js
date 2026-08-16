// ============================================================================
// UI 层：场景联动卡片视图
// 依赖方向：view → service（查询/操作）、emitter（事件订阅）
// ============================================================================

export function createSceneView({ container, service, emitter, onRemove, onToggle, lookupSensor, lookupActuator }) {
    emitter.on('scene-added', render);
    emitter.on('scene-removed', (id) => {
        document.getElementById(id)?.remove();
    });
    emitter.on('scene-updated', (scene) => {
        updateEnabled(scene);
    });

    /**
     * 渲染场景卡片
     * @param {{id:string, name:string, enabled:boolean}} scene
     */
    function render(scene) {
        if (document.getElementById(scene.id)) return;

        const { conditionText, actionText } = service.describe(
            scene,
            lookupSensor,
            lookupActuator
        );

        const card = document.createElement('div');
        card.id = scene.id;
        card.className = 'scene-card';

        card.innerHTML = `
            <button class="delete-btn" type="button">×</button>
            <div class="scene-card-header">
                <span class="scene-dot"></span>
                <h4>${scene.name}</h4>
            </div>
            <div class="scene-block">
                <span class="scene-block-label">触发条件</span>
                <span class="scene-block-text">${conditionText}</span>
            </div>
            <div class="scene-block scene-block-action">
                <span class="scene-block-label">执行动作</span>
                <span class="scene-block-text">${actionText}</span>
            </div>
            <button class="toggle-btn ${scene.enabled ? 'on' : 'off'}" type="button">
                ${scene.enabled ? '已启用' : '已禁用'}
            </button>
        `;

        card.querySelector('.delete-btn').addEventListener('click', () => onRemove(scene.id));
        card.querySelector('.toggle-btn').addEventListener('click', () => onToggle(scene.id));

        container.appendChild(card);
    }

    /**
     * 更新启用状态按钮
     */
    function updateEnabled(scene) {
        const card = document.getElementById(scene.id);
        if (!card) return;
        const btn = card.querySelector('.toggle-btn');
        if (btn) {
            btn.textContent = scene.enabled ? '已启用' : '已禁用';
            btn.className = `toggle-btn ${scene.enabled ? 'on' : 'off'}`;
        }
    }

    return { render };
}
