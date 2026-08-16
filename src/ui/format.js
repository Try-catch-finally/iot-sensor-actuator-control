// ============================================================================
// UI 层：数值格式化工具
// ============================================================================

/**
 * 传感器数值显示格式化
 * @param {number|number[]|string} value
 * @param {string} unit
 * @returns {string}
 */
export function formatSensorValue(value, unit) {
    const text = Array.isArray(value)
        ? value.join(', ')
        : typeof value === 'number'
            ? value.toFixed(1)
            : String(value);
    return `${text} ${unit}`;
}
