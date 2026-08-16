// ============================================================================
// 核心层：极简事件总线（模块间解耦，订阅/发布）
// ============================================================================

export function createEmitter() {
    const handlers = new Map();

    return {
        /**
         * 订阅事件，返回取消订阅函数
         * @param {string} event
         * @param {Function} fn
         */
        on(event, fn) {
            if (!handlers.has(event)) {
                handlers.set(event, new Set());
            }
            handlers.get(event).add(fn);
            return () => this.off(event, fn);
        },

        off(event, fn) {
            const set = handlers.get(event);
            if (set) {
                set.delete(fn);
            }
        },

        /**
         * 发布事件
         * @param {string} event
         * @param {*} payload
         */
        emit(event, payload) {
            const set = handlers.get(event);
            if (set) {
                set.forEach(fn => fn(payload));
            }
        }
    };
}
