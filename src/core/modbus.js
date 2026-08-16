// ============================================================================
// 核心层：Modbus 协议（纯函数，不依赖 DOM / 网络 / 存储）
// 职责：CRC16 校验、RTU/TCP 命令构建、RTU/TCP 响应解析
// ============================================================================

/**
 * Modbus RTU CRC16 计算（多项式 0xA001，初始值 0xFFFF）
 * @param {number[]} data 字节数组
 * @returns {number[]} [低字节, 高字节]（Modbus 低字节在前）
 */
export function calculateCRC16(data) {
    let crc = 0xFFFF;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            const lsb = crc & 0x0001;
            crc = crc >> 1;
            if (lsb) {
                crc ^= 0xA001;
            }
        }
    }
    return [crc & 0xFF, (crc >> 8) & 0xFF];
}

/**
 * HEX 字符串转字节数组（忽略空白）
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
    const clean = hex.replace(/\s+/g, '');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
    }
    return bytes;
}

/**
 * 字节数组转大写 HEX 字符串
 * @param {ArrayLike<number>} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
}

/**
 * 构建 Modbus 读命令帧（读线圈/离散输入/保持寄存器/输入寄存器）
 * @param {number} slaveAddr 从机地址
 * @param {number} funcCode 功能码（0x01~0x04）
 * @param {number} startReg 起始地址
 * @param {number} regCount 数量
 * @returns {string} HEX 字符串（含 CRC16）
 */
export function buildReadCommand(slaveAddr, funcCode, startReg, regCount) {
    const data = [
        slaveAddr,
        funcCode,
        (startReg >> 8) & 0xFF,
        startReg & 0xFF,
        (regCount >> 8) & 0xFF,
        regCount & 0xFF
    ];
    return bytesToHex(data.concat(calculateCRC16(data)));
}

/**
 * 构建执行器写命令帧（写单个线圈 0x05 / 单个寄存器 0x06 / 多个线圈 0x0F / 多个寄存器 0x10）
 * @param {{slaveAddr:number, funcCode:number, startReg:number, regCount:number, writeValue:number}} config
 * @param {boolean} turnOn true=开启, false=关闭
 * @returns {string} HEX 字符串（含 CRC16），不支持的功能码返回 ''
 */
export function buildWriteCommand(config, turnOn) {
    const { slaveAddr, funcCode, startReg, regCount, writeValue } = config;
    let data;

    if (funcCode === 0x05) {
        const value = turnOn ? 0xFF00 : 0x0000;
        data = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
    } else if (funcCode === 0x06) {
        const value = turnOn ? writeValue : 0x0000;
        data = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
    } else if (funcCode === 0x0F) {
        const byteCount = Math.ceil(regCount / 8);
        const coilData = new Array(byteCount).fill(0);
        if (turnOn) {
            for (let i = 0; i < regCount; i++) {
                coilData[Math.floor(i / 8)] |= (1 << (i % 8));
            }
        }
        data = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF,
            (regCount >> 8) & 0xFF, regCount & 0xFF, byteCount, ...coilData];
    } else if (funcCode === 0x10) {
        const regData = new Array(regCount * 2).fill(0);
        if (turnOn) {
            for (let i = 0; i < regCount; i++) {
                regData[i * 2] = (writeValue >> 8) & 0xFF;
                regData[i * 2 + 1] = writeValue & 0xFF;
            }
        }
        data = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF,
            (regCount >> 8) & 0xFF, regCount & 0xFF, regCount * 2, ...regData];
    } else {
        return '';
    }

    return bytesToHex(data.concat(calculateCRC16(data)));
}

/**
 * 构建 Modbus TCP 读命令帧（MBAP 头 + 单元标识符 + PDU）
 * 帧结构：[事务ID 2][协议ID 2][长度 2][单元ID 1][功能码 1][数据...]
 * @param {number} transactionId 事务标识符
 * @param {number} protocolId 协议标识符（固定为 0）
 * @param {number} slaveAddr 从机地址（单元标识符）
 * @param {number} funcCode 功能码（0x01~0x04）
 * @param {number} startReg 起始地址
 * @param {number} regCount 数量
 * @returns {string} HEX 字符串（含 MBAP 头）
 */
export function buildReadCommandTCP(transactionId, protocolId, slaveAddr, funcCode, startReg, regCount) {
    const pdu = [
        slaveAddr,
        funcCode,
        (startReg >> 8) & 0xFF,
        startReg & 0xFF,
        (regCount >> 8) & 0xFF,
        regCount & 0xFF
    ];
    return bytesToHex([
        (transactionId >> 8) & 0xFF,
        transactionId & 0xFF,
        (protocolId >> 8) & 0xFF,
        protocolId & 0xFF,
        (pdu.length >> 8) & 0xFF,
        pdu.length & 0xFF,
        ...pdu
    ]);
}

/**
 * 构建 Modbus TCP 写命令帧（MBAP 头 + 单元标识符 + PDU）
 * @param {number} transactionId 事务标识符
 * @param {number} protocolId 协议标识符（固定为 0）
 * @param {{slaveAddr:number, funcCode:number, startReg:number, regCount:number, writeValue:number}} config
 * @param {boolean} turnOn true=开启, false=关闭
 * @returns {string} HEX 字符串（含 MBAP 头），不支持的功能码返回 ''
 */
export function buildWriteCommandTCP(transactionId, protocolId, config, turnOn) {
    const { slaveAddr, funcCode, startReg, regCount, writeValue } = config;
    let pdu;

    if (funcCode === 0x05) {
        const value = turnOn ? 0xFF00 : 0x0000;
        pdu = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
    } else if (funcCode === 0x06) {
        const value = turnOn ? writeValue : 0x0000;
        pdu = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
    } else if (funcCode === 0x0F) {
        const byteCount = Math.ceil(regCount / 8);
        const coilData = new Array(byteCount).fill(0);
        if (turnOn) {
            for (let i = 0; i < regCount; i++) {
                coilData[Math.floor(i / 8)] |= (1 << (i % 8));
            }
        }
        pdu = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF,
            (regCount >> 8) & 0xFF, regCount & 0xFF, byteCount, ...coilData];
    } else if (funcCode === 0x10) {
        const regData = new Array(regCount * 2).fill(0);
        if (turnOn) {
            for (let i = 0; i < regCount; i++) {
                regData[i * 2] = (writeValue >> 8) & 0xFF;
                regData[i * 2 + 1] = writeValue & 0xFF;
            }
        }
        pdu = [slaveAddr, funcCode, (startReg >> 8) & 0xFF, startReg & 0xFF,
            (regCount >> 8) & 0xFF, regCount & 0xFF, regCount * 2, ...regData];
    } else {
        return '';
    }

    return bytesToHex([
        (transactionId >> 8) & 0xFF,
        transactionId & 0xFF,
        (protocolId >> 8) & 0xFF,
        protocolId & 0xFF,
        (pdu.length >> 8) & 0xFF,
        pdu.length & 0xFF,
        ...pdu
    ]);
}

/**
 * 解析 Modbus TCP 响应帧（MBAP 头：事务ID 2 + 协议ID 2 + 长度 2，随后 PDU）
 * @param {string} hexData 完整响应帧（HEX）
 * @returns {{valid:boolean, error?:string, type?:string, slaveAddr?:number, funcCode?:number, ...}} 解析结果
 */
export function parseModbusTCP(hexData) {
    try {
        const bytes = hexToBytes(hexData);
        if (bytes.length < 9) {
            return { valid: false, error: `数据长度不足（当前长度: ${bytes.length}），原始数据: ${hexData}` };
        }

        const protocolId = (bytes[2] << 8) | bytes[3];
        if (protocolId !== 0) {
            return { valid: false, error: `协议标识符不为 0 (${protocolId})，原始数据: ${hexData}` };
        }

        const slaveAddr = bytes[6];
        const funcCode = bytes[7];
        const data = { slaveAddr, funcCode, rawData: hexData };

        if (funcCode >= 0x80) {
            // 异常响应：PDU = [功能码|0x80][异常码]，1 字节异常码
            if (bytes.length !== 9) {
                return { valid: false, error: `异常响应长度不匹配（预期: 9，实际: ${bytes.length}）` };
            }
            data.type = 'exception';
            data.exceptionCode = bytes[8];
            data.exceptionMessage = EXCEPTION_MESSAGES[bytes[8]] || '未知异常';
        } else if (WRITE_FUNC_CODES.includes(funcCode)) {
            // 写操作确认：PDU = [单元][功能码][地址 2][值/数量 2]，共 5 字节
            if (bytes.length !== 12) {
                return { valid: false, error: `写确认数据长度不匹配（预期: 12，实际: ${bytes.length}）` };
            }
            data.type = 'writeConfirm';
            data.coilAddr = (bytes[8] << 8) | bytes[9];
            data.coilValue = (bytes[10] << 8) | bytes[11];
            data.success = true;
        } else {
            // 读操作响应：PDU 数据从 byte[9] 开始（byte[8] 为数据字节数）
            const byteCount = bytes[8];
            if (bytes.length !== 9 + byteCount) {
                return { valid: false, error: `读响应长度不匹配（预期: ${9 + byteCount}，实际: ${bytes.length}）` };
            }
            if (funcCode === 0x01) {
                const coils = [];
                for (let i = 0; i < byteCount; i++) {
                    for (let j = 0; j < 8; j++) {
                        coils.push((bytes[9 + i] >> j) & 0x01);
                    }
                }
                data.type = 'coils';
                data.value = coils.slice(0, byteCount * 8);
                data.itemCount = byteCount * 8;
            } else if (funcCode === 0x02) {
                const inputs = [];
                for (let i = 0; i < byteCount; i++) {
                    for (let j = 0; j < 8; j++) {
                        inputs.push((bytes[9 + i] >> j) & 0x01);
                    }
                }
                data.type = 'inputs';
                data.value = inputs.slice(0, byteCount * 8);
                data.itemCount = byteCount * 8;
            } else if (funcCode === 0x03 || funcCode === 0x04) {
                const registers = [];
                for (let i = 0; i < byteCount / 2; i++) {
                    registers.push((bytes[9 + i * 2] << 8) | bytes[10 + i * 2]);
                }
                data.type = funcCode === 0x03 ? 'holdingRegisters' : 'inputRegisters';
                data.value = registers;
                data.regCount = registers.length;
            } else {
                data.type = 'unknown';
                data.error = '未知功能码';
            }
        }

        return { valid: true, ...data };
    } catch (e) {
        return { valid: false, error: `解析错误: ${e.message}` };
    }
}

const WRITE_FUNC_CODES = [0x05, 0x06, 0x0F, 0x10];

/**
 * Modbus TCP 端口
 */
export const MODBUS_TCP_PORT = 502;

/**
 * 计算 Modbus RTU 帧长：
 * - 异常响应 5 字节，写确认 8 字节
 * - 读响应 = 3 + 数据字节数 + 2
 */
function frameLength(bytes) {
    if (bytes.length < 2) return null;
    const funcCode = bytes[1];
    if (funcCode >= 0x80) return 5;
    if (WRITE_FUNC_CODES.includes(funcCode)) return 8;
    if (bytes.length < 3) return null;
    return 3 + bytes[2] + 2;
}

/**
 * 判断帧 CRC 是否正确（帧内最后 2 字节为 CRC，低字节在前）
 */
function isFrameValid(frame) {
    const [crcLo, crcHi] = calculateCRC16(frame.slice(0, frame.length - 2));
    return crcLo === frame[frame.length - 2] && crcHi === frame[frame.length - 1];
}

/**
 * Modbus RTU 帧解码器：解决 MQTT 消息粘包/拆包问题
 * MQTT 消息边界与 Modbus 帧边界不对应，一个消息可能包含多帧或半帧。
 * 内部维护字节缓冲，按帧格式 + CRC 校验滑动提取完整帧。
 */
export class ModbusFrameDecoder {
    constructor() {
        this.buffer = new Uint8Array(0);
    }

    /**
     * 喂入原始字节，返回提取出的完整帧列表（每帧为 Uint8Array）
     * @param {ArrayLike<number>} bytes
     * @returns {Uint8Array[]}
     */
    push(bytes) {
        const merged = new Uint8Array(this.buffer.length + bytes.length);
        merged.set(this.buffer);
        merged.set(bytes, this.buffer.length);
        this.buffer = merged;

        const frames = [];
        while (true) {
            const len = frameLength(this.buffer);
            // 数据不足以凑齐一帧 → 等待更多数据；
            // 但帧长超 255 或缓冲超 512 字节仍无法成帧 → 视为垃圾，滑动丢弃
            if (len === null || len > this.buffer.length) {
                if ((len !== null && len > 255) || this.buffer.length > 512) {
                    this.buffer = this.buffer.slice(1);
                    continue;
                }
                break;
            }
            const candidate = this.buffer.slice(0, len);
            if (isFrameValid(candidate)) {
                frames.push(candidate);
                this.buffer = this.buffer.slice(len);
            } else {
                // CRC 不匹配：丢弃 1 字节，滑动寻找合法帧边界（处理粘包与噪音）
                this.buffer = this.buffer.slice(1);
            }
        }
        return frames;
    }
}

const EXCEPTION_MESSAGES = {
    0x01: '非法功能码',
    0x02: '非法数据地址',
    0x03: '非法数据值',
    0x04: '从站设备故障',
    0x05: '确认',
    0x06: '从站设备忙',
    0x07: '负确认',
    0x08: '内存奇偶错误',
    0x0A: '网关路径不可用',
    0x0B: '网关目标设备无响应'
};

/**
 * 解析 Modbus RTU 响应帧（支持 0x01~0x10 及异常码）
 * @param {string} hexData 完整响应帧（HEX）
 * @returns {{valid:boolean, error?:string, type?:string, slaveAddr?:number, funcCode?:number, ...}} 解析结果
 */
export function parseModbusRTU(hexData) {
    try {
        const bytes = hexToBytes(hexData);
        if (bytes.length < 5) {
            return { valid: false, error: `数据长度不足（当前长度: ${bytes.length}），原始数据: ${hexData}` };
        }

        const slaveAddr = bytes[0];
        const funcCode = bytes[1];
        const data = { slaveAddr, funcCode, rawData: hexData };

        if (funcCode >= 0x80) {
            // 异常响应：固定 [从机][功能码|0x80][异常码][CRC低][CRC高]（5字节），不做读/写长度校验
        } else if (WRITE_FUNC_CODES.includes(funcCode)) {
            if (bytes.length !== 8) {
                return { valid: false, error: `数据长度不匹配（预期: 8，实际: ${bytes.length}）` };
            }
        } else {
            const dataLength = bytes[2];
            if (bytes.length !== 3 + dataLength + 2) {
                return { valid: false, error: `数据长度不匹配（预期: ${3 + dataLength + 2}，实际: ${bytes.length}）` };
            }
        }

        if (funcCode === 0x01) {
            const byteCount = bytes[2];
            const coils = [];
            for (let i = 0; i < byteCount; i++) {
                for (let j = 0; j < 8; j++) {
                    coils.push((bytes[3 + i] >> j) & 0x01);
                }
            }
            data.type = 'coils';
            data.value = coils.slice(0, byteCount * 8);
            data.itemCount = byteCount * 8;
        } else if (funcCode === 0x02) {
            const byteCount = bytes[2];
            const inputs = [];
            for (let i = 0; i < byteCount; i++) {
                for (let j = 0; j < 8; j++) {
                    inputs.push((bytes[3 + i] >> j) & 0x01);
                }
            }
            data.type = 'inputs';
            data.value = inputs.slice(0, byteCount * 8);
            data.itemCount = byteCount * 8;
        } else if (funcCode === 0x03 || funcCode === 0x04) {
            const dataLength = bytes[2];
            const registers = [];
            for (let i = 0; i < dataLength / 2; i++) {
                registers.push((bytes[3 + i * 2] << 8) | bytes[4 + i * 2]);
            }
            data.type = funcCode === 0x03 ? 'holdingRegisters' : 'inputRegisters';
            data.value = registers;
            data.regCount = registers.length;
        } else if (funcCode === 0x05) {
            data.type = 'writeCoil';
            data.coilAddr = (bytes[2] << 8) | bytes[3];
            data.coilValue = ((bytes[4] << 8) | bytes[5]) === 0xFF00;
            data.success = true;
        } else if (funcCode === 0x06) {
            data.type = 'writeRegister';
            data.regAddr = (bytes[2] << 8) | bytes[3];
            data.regValue = (bytes[4] << 8) | bytes[5];
            data.success = true;
        } else if (funcCode === 0x0F) {
            data.type = 'writeCoils';
            data.startAddr = (bytes[2] << 8) | bytes[3];
            data.coilCount = (bytes[4] << 8) | bytes[5];
            data.success = true;
        } else if (funcCode === 0x10) {
            data.type = 'writeRegisters';
            data.startAddr = (bytes[2] << 8) | bytes[3];
            data.regCount = (bytes[4] << 8) | bytes[5];
            data.success = true;
        } else if (funcCode >= 0x80) {
            data.type = 'exception';
            data.exceptionCode = bytes[2];
            data.exceptionMessage = EXCEPTION_MESSAGES[bytes[2]] || '未知异常';
        } else {
            data.type = 'unknown';
            data.error = '未知功能码';
        }

        return { valid: true, ...data };
    } catch (e) {
        return { valid: false, error: `解析错误: ${e.message}` };
    }
}
