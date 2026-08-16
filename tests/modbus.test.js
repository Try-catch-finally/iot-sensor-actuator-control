// ============================================================================
// 单元测试：Modbus 协议层（纯函数）
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
    calculateCRC16,
    hexToBytes,
    bytesToHex,
    buildReadCommand,
    buildWriteCommand,
    parseModbusRTU,
    ModbusFrameDecoder,
    buildReadCommandTCP,
    buildWriteCommandTCP,
    parseModbusTCP,
    MODBUS_TCP_PORT
} from '../src/core/modbus.js';

/** 完整帧（含 CRC）再次计算 CRC 应为 0 */
function crcOfFullFrame(hex) {
    return calculateCRC16(Array.from(hexToBytes(hex)));
}

describe('calculateCRC16', () => {
    it('标准向量：03 03 00 00 00 02 → [0xC5, 0xE9]（低字节在前）', () => {
        expect(calculateCRC16([0x03, 0x03, 0x00, 0x00, 0x00, 0x02])).toEqual([0xC5, 0xE9]);
    });

    it('修正写死命令中的错误 CRC：05 03 00 00 00 02 → [0xC5, 0x8F]', () => {
        expect(calculateCRC16([0x05, 0x03, 0x00, 0x00, 0x00, 0x02])).toEqual([0xC5, 0x8F]);
    });

    it('完整帧校验和为零', () => {
        expect(crcOfFullFrame('030300000002C5E9')).toEqual([0x00, 0x00]);
        expect(crcOfFullFrame('02030002000125F9')).toEqual([0x00, 0x00]);
    });
});

describe('hexToBytes / bytesToHex', () => {
    it('HEX 转字节数组', () => {
        expect(Array.from(hexToBytes('0A 04 00 00'))).toEqual([0x0A, 0x04, 0x00, 0x00]);
    });

    it('字节数组转 HEX（大写，忽略空白输入）', () => {
        expect(bytesToHex([0x02, 0x03, 0x00, 0x02])).toBe('02030002');
    });
});

describe('buildReadCommand', () => {
    it('光照传感器命令（从机 0x02）', () => {
        expect(buildReadCommand(0x02, 0x03, 0x0002, 1)).toBe('02030002000125F9');
    });

    it('温湿度命令（从机 0x03，2 寄存器）', () => {
        expect(buildReadCommand(0x03, 0x03, 0x0000, 2)).toBe('030300000002C5E9');
    });

    it('电压命令（从机 0x0A，输入寄存器）', () => {
        expect(buildReadCommand(0x0A, 0x04, 0x0000, 1)).toBe('0A040000000130B1');
    });

    it('生成帧 CRC 校验正确', () => {
        expect(crcOfFullFrame(buildReadCommand(0x0F, 0x03, 0x0000, 2))).toEqual([0x00, 0x00]);
    });
});

describe('buildWriteCommand', () => {
    const coil = { slaveAddr: 0x05, funcCode: 0x05, startReg: 0x0000, regCount: 1, writeValue: 0xFF00 };
    const register = { slaveAddr: 0x05, funcCode: 0x06, startReg: 0x0000, regCount: 1, writeValue: 0x005A };
    const multiCoil = { slaveAddr: 0x06, funcCode: 0x0F, startReg: 0x0000, regCount: 8, writeValue: 0xFF00 };
    const multiRegister = { slaveAddr: 0x06, funcCode: 0x10, startReg: 0x0000, regCount: 2, writeValue: 0x0001 };

    it('写单个线圈：ON=FF00, OFF=0000', () => {
        expect(buildWriteCommand(coil, true)).toBe('05050000FF008DBE');
        expect(buildWriteCommand(coil, false)).toBe('050500000000CC4E');
    });

    it('写单个寄存器：ON=writeValue, OFF=0000', () => {
        expect(buildWriteCommand(register, true)).toBe('05060000005A0875');
        expect(buildWriteCommand(register, false)).toBe('050600000000884E');
    });

    it('写多个线圈（0x0F）：8 位全开 → 1 字节 0xFF', () => {
        expect(buildWriteCommand(multiCoil, true)).toBe('060F0000000801FFFF33');
        expect(buildWriteCommand(multiCoil, false)).toBe('060F000000080100BF73');
    });

    it('写多个寄存器（0x10）：字节数与数据正确', () => {
        const cmd = buildWriteCommand(multiRegister, true);
        expect(cmd.startsWith('0610000000020400010001')).toBe(true);
    });

    it('不支持的功能码返回空字符串', () => {
        expect(buildWriteCommand({ ...coil, funcCode: 0x99 }, true)).toBe('');
    });

    it('所有写命令帧 CRC 校验正确', () => {
        [coil, register, multiCoil, multiRegister].forEach(cfg => {
            expect(crcOfFullFrame(buildWriteCommand(cfg, true))).toEqual([0x00, 0x00]);
            expect(crcOfFullFrame(buildWriteCommand(cfg, false))).toEqual([0x00, 0x00]);
        });
    });
});

describe('parseModbusRTU', () => {
    function frame(slave, func, payloadBytes) {
        const data = [slave, func, ...payloadBytes];
        return bytesToHex(data.concat(calculateCRC16(data)));
    }

    it('解析保持寄存器（0x03）', () => {
        // 湿度 654（0x028E），温度 265（0x0109）
        const result = parseModbusRTU(frame(0x03, 0x03, [0x04, 0x02, 0x8E, 0x01, 0x09]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('holdingRegisters');
        expect(result.value).toEqual([0x028E, 0x0109]);
        expect(result.regCount).toBe(2);
    });

    it('解析输入寄存器（0x04）', () => {
        const result = parseModbusRTU(frame(0x0A, 0x04, [0x02, 0x00, 0x96]));
        expect(result.type).toBe('inputRegisters');
        expect(result.value).toEqual([0x0096]);
    });

    it('解析线圈响应（0x01）：字节按位展开', () => {
        const result = parseModbusRTU(frame(0x0C, 0x01, [0x01, 0x05]));
        expect(result.type).toBe('coils');
        expect(result.value.slice(0, 8)).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
    });

    it('解析写单个线圈确认（0x05，8 字节固定）', () => {
        const result = parseModbusRTU(frame(0x05, 0x05, [0x00, 0x00, 0xFF, 0x00]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('writeCoil');
        expect(result.coilAddr).toBe(0x0000);
        expect(result.coilValue).toBe(true);
        expect(result.success).toBe(true);
    });

    it('解析写多个寄存器确认（0x10）', () => {
        const result = parseModbusRTU(frame(0x06, 0x10, [0x00, 0x00, 0x00, 0x02]));
        expect(result.type).toBe('writeRegisters');
        expect(result.startAddr).toBe(0x0000);
        expect(result.regCount).toBe(2);
    });

    it('解析异常响应：功能码置最高位', () => {
        const result = parseModbusRTU(frame(0x02, 0x83, [0x02]));
        expect(result.type).toBe('exception');
        expect(result.exceptionCode).toBe(0x02);
        expect(result.exceptionMessage).toBe('非法数据地址');
    });

    it('数据长度不足时返回错误', () => {
        expect(parseModbusRTU('0103').valid).toBe(false);
    });

    it('读响应长度不匹配时返回错误', () => {
        // 声明 4 字节数据但只有 2 字节
        const bad = frame(0x03, 0x03, [0x04, 0x00, 0x01]);
        expect(parseModbusRTU(bad).valid).toBe(false);
    });
});

describe('ModbusFrameDecoder', () => {
    function frame(slave, func, payloadBytes) {
        const data = [slave, func, ...payloadBytes];
        return bytesToHex(data.concat(calculateCRC16(data)));
    }

    const read9 = frame(0x05, 0x03, [0x02, 0x00, 0x96]);
    const read8 = frame(0x06, 0x04, [0x01, 0x00]);
    const write8 = frame(0x05, 0x05, [0x00, 0x00, 0xFF, 0x00]);
    const exception5 = frame(0x02, 0x83, [0x02]);

    it('单条消息一帧', () => {
        const d = new ModbusFrameDecoder();
        const frames = d.push(hexToBytes(read9));
        expect(frames.length).toBe(1);
        expect(bytesToHex(frames[0])).toBe(read9);
    });

    it('粘包：一条消息含两帧（18 字节 = 9×2）', () => {
        const d = new ModbusFrameDecoder();
        const frames = d.push(hexToBytes(read9 + read9));
        expect(frames.length).toBe(2);
        expect(bytesToHex(frames[0])).toBe(read9);
        expect(bytesToHex(frames[1])).toBe(read9);
    });

    it('粘包：9 字节帧 + 8 字节帧 = 17 字节', () => {
        const d = new ModbusFrameDecoder();
        const frames = d.push(hexToBytes(read9 + write8));
        expect(frames.length).toBe(2);
        expect(bytesToHex(frames[0])).toBe(read9);
        expect(bytesToHex(frames[1])).toBe(write8);
    });

    it('拆包：半帧消息分两次到达', () => {
        const d = new ModbusFrameDecoder();
        const hex = read9;
        expect(d.push(hexToBytes(hex.slice(0, 10))).length).toBe(0);
        const frames = d.push(hexToBytes(hex.slice(10)));
        expect(frames.length).toBe(1);
        expect(bytesToHex(frames[0])).toBe(read9);
    });

    it('多帧分多次到达，跨消息拼接', () => {
        const d = new ModbusFrameDecoder();
        const combined = read9 + exception5 + write8;
        const frames = [];
        frames.push(...d.push(hexToBytes(combined.slice(0, 6))));
        frames.push(...d.push(hexToBytes(combined.slice(6, 22))));
        frames.push(...d.push(hexToBytes(combined.slice(22))));
        expect(frames.map(f => bytesToHex(f))).toEqual([read9, exception5, write8]);
    });

    it('异常帧（5 字节）正常提取', () => {
        const d = new ModbusFrameDecoder();
        const frames = d.push(hexToBytes(exception5));
        expect(frames.length).toBe(1);
        expect(bytesToHex(frames[0])).toBe(exception5);
    });

    it('帧间夹杂噪音字节时滑动恢复', () => {
        const d = new ModbusFrameDecoder();
        // 前导垃圾字节 AE + 合法帧
        const frames = d.push(new Uint8Array([0xAE, ...hexToBytes(read9)]));
        expect(frames.length).toBe(1);
        expect(bytesToHex(frames[0])).toBe(read9);
    });

    it('CRC 错误的帧被丢弃，滑动后后续合法帧仍能提取', () => {
        const d = new ModbusFrameDecoder();
        const bad = read9.slice(0, read9.length - 2) + '0000';
        // 追加足够多的合法帧，让解码器滑出垃圾区
        const stream = hexToBytes(bad + read8.repeat(60));
        const frames = d.push(stream);
        expect(frames.length).toBeGreaterThanOrEqual(50);
        frames.forEach(f => expect(bytesToHex(f)).toBe(read8));
    });

    it('CRC 错误字节不改变帧长计算（不误吞后续帧）', () => {
        const d = new ModbusFrameDecoder();
        // 三帧正常 → 全部提取
        const frames = d.push(hexToBytes(read9 + write8 + exception5));
        expect(frames.map(f => bytesToHex(f))).toEqual([read9, write8, exception5]);
    });

    it('噪声单字节等待更多数据，不报错不产出', () => {
        const d = new ModbusFrameDecoder();
        expect(d.push(new Uint8Array([0xAE])).length).toBe(0);
    });

    it('超过 512 字节的无效数据自动清理', () => {
        const d = new ModbusFrameDecoder();
        const garbage = new Uint8Array(600).fill(0xAE);
        const frames = d.push(garbage);
        expect(frames.length).toBe(0);
        expect(d.buffer.length).toBeLessThan(512);
    });

    it('解码器输出的帧可直接交给 parseModbusRTU 解析', () => {
        const d = new ModbusFrameDecoder();
        const frames = d.push(hexToBytes(read9 + write8));
        expect(parseModbusRTU(bytesToHex(frames[0])).valid).toBe(true);
        expect(parseModbusRTU(bytesToHex(frames[1])).valid).toBe(true);
    });
});

/**
 * 生成标准 Modbus TCP 完整帧（MBAP 头，不含 CRC）
 * @param {number} transactionId 事务标识符
 * @param {number} protocolId 协议标识符（固定为 0）
 * @param {number} slaveAddr 从机地址
 * @param {number} funcCode 功能码
 * @param {number[]} payloadBytes 数据字节
 */
function tcpFrame(transactionId, protocolId, slaveAddr, funcCode, payloadBytes) {
    const pdu = [slaveAddr, funcCode, ...payloadBytes];
    const frame = [
        (transactionId >> 8) & 0xFF,
        transactionId & 0xFF,
        (protocolId >> 8) & 0xFF,
        protocolId & 0xFF,
        (pdu.length >> 8) & 0xFF,
        pdu.length & 0xFF,
        ...pdu
    ];
    return bytesToHex(frame);
}

describe('buildReadCommandTCP', () => {
    const transactionId = 0x0001;
    const protocolId = 0x0000;

    it('构建读命令（保持寄存器）', () => {
        const result = buildReadCommandTCP(transactionId, protocolId, 0x03, 0x03, 0x0000, 2);
        expect(result).toBe('000100000006030300000002');
    });

    it('构建读命令（输入寄存器）', () => {
        const result = buildReadCommandTCP(transactionId, protocolId, 0x0A, 0x04, 0x0000, 1);
        expect(result).toBe('0001000000060A0400000001');
    });

    it('事务标识符正确编码', () => {
        expect(buildReadCommandTCP(0x00FF, protocolId, 0x01, 0x03, 0x0002, 1)).toBe('00FF00000006010300020001');
    });
});

describe('buildWriteCommandTCP', () => {
    const transactionId = 0x0002;
    const protocolId = 0x0000;
    const coil = { slaveAddr: 0x05, funcCode: 0x05, startReg: 0x0000, regCount: 1, writeValue: 0xFF00 };
    const register = { slaveAddr: 0x06, funcCode: 0x06, startReg: 0x0000, regCount: 1, writeValue: 0x005A };
    const multiCoil = { slaveAddr: 0x07, funcCode: 0x0F, startReg: 0x0000, regCount: 8, writeValue: 0xFF00 };
    const multiRegister = { slaveAddr: 0x08, funcCode: 0x10, startReg: 0x0000, regCount: 2, writeValue: 0x0001 };

    it('构建写单个线圈命令', () => {
        const result = buildWriteCommandTCP(transactionId, protocolId, coil, true);
        expect(result).toBe('00020000000605050000FF00');
    });

    it('构建写单个寄存器命令', () => {
        const result = buildWriteCommandTCP(transactionId, protocolId, register, true);
        expect(result).toBe('00020000000606060000005A');
    });

    it('构建写多个线圈命令', () => {
        const result = buildWriteCommandTCP(transactionId, protocolId, multiCoil, true);
        expect(result).toBe('000200000008070F0000000801FF');
    });

    it('构建写多个寄存器命令', () => {
        const result = buildWriteCommandTCP(transactionId, protocolId, multiRegister, true);
        expect(result).toBe('00020000000B0810000000020400010001');
    });

    it('不支持的功能码返回空字符串', () => {
        const bad = { ...coil, funcCode: 0x99 };
        expect(buildWriteCommandTCP(transactionId, protocolId, bad, true)).toBe('');
    });
});

describe('parseModbusTCP', () => {
    it('解析保持寄存器响应（0x03）', () => {
        // 湿度 654（0x028E），温度 265（0x0109）
        const result = parseModbusTCP(tcpFrame(0x01, 0x00, 0x03, 0x03, [0x04, 0x02, 0x8E, 0x01, 0x09]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('holdingRegisters');
        expect(result.value).toEqual([0x028E, 0x0109]);
        expect(result.regCount).toBe(2);
        expect(result.slaveAddr).toBe(0x03);
        expect(result.funcCode).toBe(0x03);
    });

    it('解析输入寄存器响应（0x04）', () => {
        const result = parseModbusTCP(tcpFrame(0x02, 0x00, 0x0A, 0x04, [0x02, 0x00, 0x96]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('inputRegisters');
        expect(result.value).toEqual([0x0096]);
    });

    it('解析线圈响应（0x01）：字节按位展开', () => {
        const result = parseModbusTCP(tcpFrame(0x03, 0x00, 0x0C, 0x01, [0x01, 0x05]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('coils');
        expect(result.value.slice(0, 8)).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
    });

    it('解析写单个线圈确认（0x05）', () => {
        const result = parseModbusTCP(tcpFrame(0x04, 0x00, 0x05, 0x05, [0x00, 0x00, 0xFF, 0x00]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('writeConfirm');
        expect(result.coilAddr).toBe(0x0000);
        expect(result.coilValue).toBe(0xFF00);
        expect(result.success).toBe(true);
    });

    it('解析写多个寄存器确认（0x10）', () => {
        const result = parseModbusTCP(tcpFrame(0x05, 0x00, 0x06, 0x10, [0x00, 0x00, 0x00, 0x02]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('writeConfirm');
        expect(result.coilAddr).toBe(0x0000);
        expect(result.success).toBe(true);
    });

    it('解析异常响应', () => {
        const result = parseModbusTCP(tcpFrame(0x06, 0x00, 0x02, 0x83, [0x02]));
        expect(result.valid).toBe(true);
        expect(result.type).toBe('exception');
        expect(result.exceptionCode).toBe(0x02);
        expect(result.exceptionMessage).toBe('非法数据地址');
    });

    it('协议标识符必须为 0', () => {
        const badFrame = tcpFrame(0x07, 0x01, 0x03, 0x03, [0x04, 0x02, 0x8E, 0x01, 0x09]);
        expect(parseModbusTCP(badFrame).valid).toBe(false);
        expect(parseModbusTCP(badFrame).error).toContain('协议标识符不为 0');
    });

    it('异常响应长度校验', () => {
        // 构造异常响应，但附带多余字节
        const badFrame = tcpFrame(0x08, 0x00, 0x02, 0x83, [0x02, 0x04]);
        expect(parseModbusTCP(badFrame).valid).toBe(false);
        expect(parseModbusTCP(badFrame).error).toContain('异常响应长度不匹配');
    });

    it('写确认数据长度校验', () => {
        // 构造写确认，但附带多余字节
        const badFrame = tcpFrame(0x09, 0x00, 0x05, 0x05, [0x00, 0x00, 0xFF, 0x00, 0x11]);
        expect(parseModbusTCP(badFrame).valid).toBe(false);
        expect(parseModbusTCP(badFrame).error).toContain('写确认数据长度不匹配');
    });
});

describe('MODBUS_TCP_PORT', () => {
    it('默认端口为 502', () => {
        expect(MODBUS_TCP_PORT).toBe(502);
    });
});
