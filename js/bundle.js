require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
    /*!
     * The buffer module from node.js, for the browser.
     *
     * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
     * @license  MIT
     */

    var base64 = require('base64-js')
    var ieee754 = require('ieee754')

    exports.Buffer = Buffer
    exports.SlowBuffer = Buffer
    exports.INSPECT_MAX_BYTES = 50
    Buffer.poolSize = 8192

    /**
     * If `Buffer._useTypedArrays`:
     *   === true    Use Uint8Array implementation (fastest)
     *   === false   Use Object implementation (compatible down to IE6)
     */
    Buffer._useTypedArrays = (function () {
        // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
        // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
        // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
        // because we need to be able to add all the node Buffer API methods. This is an issue
        // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
        try {
            var buf = new ArrayBuffer(0)
            var arr = new Uint8Array(buf)
            arr.foo = function () { return 42 }
            return 42 === arr.foo() &&
                typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
        } catch (e) {
            return false
        }
    })()

    /**
     * Class: Buffer
     * =============
     *
     * The Buffer constructor returns instances of `Uint8Array` that are augmented
     * with function properties for all the node `Buffer` API functions. We use
     * `Uint8Array` so that square bracket notation works as expected -- it returns
     * a single octet.
     *
     * By augmenting the instances, we can avoid modifying the `Uint8Array`
     * prototype.
     */
    function Buffer (subject, encoding, noZero) {
        if (!(this instanceof Buffer))
            return new Buffer(subject, encoding, noZero)

        var type = typeof subject

        // Workaround: node's base64 implementation allows for non-padded strings
        // while base64-js does not.
        if (encoding === 'base64' && type === 'string') {
            subject = stringtrim(subject)
            while (subject.length % 4 !== 0) {
                subject = subject + '='
            }
        }

        // Find the length
        var length
        if (type === 'number')
            length = coerce(subject)
        else if (type === 'string')
            length = Buffer.byteLength(subject, encoding)
        else if (type === 'object')
            length = coerce(subject.length) // assume that object is array-like
        else
            throw new Error('First argument needs to be a number, array or string.')

        var buf
        if (Buffer._useTypedArrays) {
            // Preferred: Return an augmented `Uint8Array` instance for best performance
            buf = Buffer._augment(new Uint8Array(length))
        } else {
            // Fallback: Return THIS instance of Buffer (created by `new`)
            buf = this
            buf.length = length
            buf._isBuffer = true
        }

        var i
        if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
            // Speed optimization -- use set if we're copying from a typed array
            buf._set(subject)
        } else if (isArrayish(subject)) {
            // Treat array-ish objects as a byte array
            for (i = 0; i < length; i++) {
                if (Buffer.isBuffer(subject))
                    buf[i] = subject.readUInt8(i)
                else
                    buf[i] = subject[i]
            }
        } else if (type === 'string') {
            buf.write(subject, 0, encoding)
        } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
            for (i = 0; i < length; i++) {
                buf[i] = 0
            }
        }

        return buf
    }

// STATIC METHODS
// ==============

    Buffer.isEncoding = function (encoding) {
        switch (String(encoding).toLowerCase()) {
            case 'hex':
            case 'utf8':
            case 'utf-8':
            case 'ascii':
            case 'binary':
            case 'base64':
            case 'raw':
            case 'ucs2':
            case 'ucs-2':
            case 'utf16le':
            case 'utf-16le':
                return true
            default:
                return false
        }
    }

    Buffer.isBuffer = function (b) {
        return !!(b !== null && b !== undefined && b._isBuffer)
    }

    Buffer.byteLength = function (str, encoding) {
        var ret
        str = str.toString()
        switch (encoding || 'utf8') {
            case 'hex':
                ret = str.length / 2
                break
            case 'utf8':
            case 'utf-8':
                ret = utf8ToBytes(str).length
                break
            case 'ascii':
            case 'binary':
            case 'raw':
                ret = str.length
                break
            case 'base64':
                ret = base64ToBytes(str).length
                break
            case 'ucs2':
            case 'ucs-2':
            case 'utf16le':
            case 'utf-16le':
                ret = str.length * 2
                break
            default:
                throw new Error('Unknown encoding')
        }
        return ret
    }

    Buffer.concat = function (list, totalLength) {
        assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

        if (list.length === 0) {
            return new Buffer(0)
        } else if (list.length === 1) {
            return list[0]
        }

        var i
        if (totalLength === undefined) {
            totalLength = 0
            for (i = 0; i < list.length; i++) {
                totalLength += list[i].length
            }
        }

        var buf = new Buffer(totalLength)
        var pos = 0
        for (i = 0; i < list.length; i++) {
            var item = list[i]
            item.copy(buf, pos)
            pos += item.length
        }
        return buf
    }

    Buffer.compare = function (a, b) {
        assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
        var x = a.length
        var y = b.length
        for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
        if (i !== len) {
            x = a[i]
            y = b[i]
        }
        if (x < y) {
            return -1
        }
        if (y < x) {
            return 1
        }
        return 0
    }

// BUFFER INSTANCE METHODS
// =======================

    function hexWrite (buf, string, offset, length) {
        offset = Number(offset) || 0
        var remaining = buf.length - offset
        if (!length) {
            length = remaining
        } else {
            length = Number(length)
            if (length > remaining) {
                length = remaining
            }
        }

        // must be an even number of digits
        var strLen = string.length
        assert(strLen % 2 === 0, 'Invalid hex string')

        if (length > strLen / 2) {
            length = strLen / 2
        }
        for (var i = 0; i < length; i++) {
            var byte = parseInt(string.substr(i * 2, 2), 16)
            assert(!isNaN(byte), 'Invalid hex string')
            buf[offset + i] = byte
        }
        return i
    }

    function utf8Write (buf, string, offset, length) {
        var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
        return charsWritten
    }

    function asciiWrite (buf, string, offset, length) {
        var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
        return charsWritten
    }

    function binaryWrite (buf, string, offset, length) {
        return asciiWrite(buf, string, offset, length)
    }

    function base64Write (buf, string, offset, length) {
        var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
        return charsWritten
    }

    function utf16leWrite (buf, string, offset, length) {
        var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
        return charsWritten
    }

    Buffer.prototype.write = function (string, offset, length, encoding) {
        // Support both (string, offset, length, encoding)
        // and the legacy (string, encoding, offset, length)
        if (isFinite(offset)) {
            if (!isFinite(length)) {
                encoding = length
                length = undefined
            }
        } else {  // legacy
            var swap = encoding
            encoding = offset
            offset = length
            length = swap
        }

        offset = Number(offset) || 0
        var remaining = this.length - offset
        if (!length) {
            length = remaining
        } else {
            length = Number(length)
            if (length > remaining) {
                length = remaining
            }
        }
        encoding = String(encoding || 'utf8').toLowerCase()

        var ret
        switch (encoding) {
            case 'hex':
                ret = hexWrite(this, string, offset, length)
                break
            case 'utf8':
            case 'utf-8':
                ret = utf8Write(this, string, offset, length)
                break
            case 'ascii':
                ret = asciiWrite(this, string, offset, length)
                break
            case 'binary':
                ret = binaryWrite(this, string, offset, length)
                break
            case 'base64':
                ret = base64Write(this, string, offset, length)
                break
            case 'ucs2':
            case 'ucs-2':
            case 'utf16le':
            case 'utf-16le':
                ret = utf16leWrite(this, string, offset, length)
                break
            default:
                throw new Error('Unknown encoding')
        }
        return ret
    }

    Buffer.prototype.toString = function (encoding, start, end) {
        var self = this

        encoding = String(encoding || 'utf8').toLowerCase()
        start = Number(start) || 0
        end = (end === undefined) ? self.length : Number(end)

        // Fastpath empty strings
        if (end === start)
            return ''

        var ret
        switch (encoding) {
            case 'hex':
                ret = hexSlice(self, start, end)
                break
            case 'utf8':
            case 'utf-8':
                ret = utf8Slice(self, start, end)
                break
            case 'ascii':
                ret = asciiSlice(self, start, end)
                break
            case 'binary':
                ret = binarySlice(self, start, end)
                break
            case 'base64':
                ret = base64Slice(self, start, end)
                break
            case 'ucs2':
            case 'ucs-2':
            case 'utf16le':
            case 'utf-16le':
                ret = utf16leSlice(self, start, end)
                break
            default:
                throw new Error('Unknown encoding')
        }
        return ret
    }

    Buffer.prototype.toJSON = function () {
        return {
            type: 'Buffer',
            data: Array.prototype.slice.call(this._arr || this, 0)
        }
    }

    Buffer.prototype.equals = function (b) {
        assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
        return Buffer.compare(this, b) === 0
    }

    Buffer.prototype.compare = function (b) {
        assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
        return Buffer.compare(this, b)
    }

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
    Buffer.prototype.copy = function (target, target_start, start, end) {
        var source = this

        if (!start) start = 0
        if (!end && end !== 0) end = this.length
        if (!target_start) target_start = 0

        // Copy 0 bytes; we're done
        if (end === start) return
        if (target.length === 0 || source.length === 0) return

        // Fatal error conditions
        assert(end >= start, 'sourceEnd < sourceStart')
        assert(target_start >= 0 && target_start < target.length,
            'targetStart out of bounds')
        assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
        assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

        // Are we oob?
        if (end > this.length)
            end = this.length
        if (target.length - target_start < end - start)
            end = target.length - target_start + start

        var len = end - start

        if (len < 100 || !Buffer._useTypedArrays) {
            for (var i = 0; i < len; i++) {
                target[i + target_start] = this[i + start]
            }
        } else {
            target._set(this.subarray(start, start + len), target_start)
        }
    }

    function base64Slice (buf, start, end) {
        if (start === 0 && end === buf.length) {
            return base64.fromByteArray(buf)
        } else {
            return base64.fromByteArray(buf.slice(start, end))
        }
    }

    function utf8Slice (buf, start, end) {
        var res = ''
        var tmp = ''
        end = Math.min(buf.length, end)

        for (var i = start; i < end; i++) {
            if (buf[i] <= 0x7F) {
                res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
                tmp = ''
            } else {
                tmp += '%' + buf[i].toString(16)
            }
        }

        return res + decodeUtf8Char(tmp)
    }

    function asciiSlice (buf, start, end) {
        var ret = ''
        end = Math.min(buf.length, end)

        for (var i = start; i < end; i++) {
            ret += String.fromCharCode(buf[i])
        }
        return ret
    }

    function binarySlice (buf, start, end) {
        return asciiSlice(buf, start, end)
    }

    function hexSlice (buf, start, end) {
        var len = buf.length

        if (!start || start < 0) start = 0
        if (!end || end < 0 || end > len) end = len

        var out = ''
        for (var i = start; i < end; i++) {
            out += toHex(buf[i])
        }
        return out
    }

    function utf16leSlice (buf, start, end) {
        var bytes = buf.slice(start, end)
        var res = ''
        for (var i = 0; i < bytes.length; i += 2) {
            res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
        }
        return res
    }

    Buffer.prototype.slice = function (start, end) {
        var len = this.length
        start = clamp(start, len, 0)
        end = clamp(end, len, len)

        if (Buffer._useTypedArrays) {
            return Buffer._augment(this.subarray(start, end))
        } else {
            var sliceLen = end - start
            var newBuf = new Buffer(sliceLen, undefined, true)
            for (var i = 0; i < sliceLen; i++) {
                newBuf[i] = this[i + start]
            }
            return newBuf
        }
    }

// `get` will be removed in Node 0.13+
    Buffer.prototype.get = function (offset) {
        console.log('.get() is deprecated. Access using array indexes instead.')
        return this.readUInt8(offset)
    }

// `set` will be removed in Node 0.13+
    Buffer.prototype.set = function (v, offset) {
        console.log('.set() is deprecated. Access using array indexes instead.')
        return this.writeUInt8(v, offset)
    }

    Buffer.prototype.readUInt8 = function (offset, noAssert) {
        if (!noAssert) {
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset < this.length, 'Trying to read beyond buffer length')
        }

        if (offset >= this.length)
            return

        return this[offset]
    }

    function readUInt16 (buf, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
        }

        var len = buf.length
        if (offset >= len)
            return

        var val
        if (littleEndian) {
            val = buf[offset]
            if (offset + 1 < len)
                val |= buf[offset + 1] << 8
        } else {
            val = buf[offset] << 8
            if (offset + 1 < len)
                val |= buf[offset + 1]
        }
        return val
    }

    Buffer.prototype.readUInt16LE = function (offset, noAssert) {
        return readUInt16(this, offset, true, noAssert)
    }

    Buffer.prototype.readUInt16BE = function (offset, noAssert) {
        return readUInt16(this, offset, false, noAssert)
    }

    function readUInt32 (buf, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
        }

        var len = buf.length
        if (offset >= len)
            return

        var val
        if (littleEndian) {
            if (offset + 2 < len)
                val = buf[offset + 2] << 16
            if (offset + 1 < len)
                val |= buf[offset + 1] << 8
            val |= buf[offset]
            if (offset + 3 < len)
                val = val + (buf[offset + 3] << 24 >>> 0)
        } else {
            if (offset + 1 < len)
                val = buf[offset + 1] << 16
            if (offset + 2 < len)
                val |= buf[offset + 2] << 8
            if (offset + 3 < len)
                val |= buf[offset + 3]
            val = val + (buf[offset] << 24 >>> 0)
        }
        return val
    }

    Buffer.prototype.readUInt32LE = function (offset, noAssert) {
        return readUInt32(this, offset, true, noAssert)
    }

    Buffer.prototype.readUInt32BE = function (offset, noAssert) {
        return readUInt32(this, offset, false, noAssert)
    }

    Buffer.prototype.readInt8 = function (offset, noAssert) {
        if (!noAssert) {
            assert(offset !== undefined && offset !== null,
                'missing offset')
            assert(offset < this.length, 'Trying to read beyond buffer length')
        }

        if (offset >= this.length)
            return

        var neg = this[offset] & 0x80
        if (neg)
            return (0xff - this[offset] + 1) * -1
        else
            return this[offset]
    }

    function readInt16 (buf, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
        }

        var len = buf.length
        if (offset >= len)
            return

        var val = readUInt16(buf, offset, littleEndian, true)
        var neg = val & 0x8000
        if (neg)
            return (0xffff - val + 1) * -1
        else
            return val
    }

    Buffer.prototype.readInt16LE = function (offset, noAssert) {
        return readInt16(this, offset, true, noAssert)
    }

    Buffer.prototype.readInt16BE = function (offset, noAssert) {
        return readInt16(this, offset, false, noAssert)
    }

    function readInt32 (buf, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
        }

        var len = buf.length
        if (offset >= len)
            return

        var val = readUInt32(buf, offset, littleEndian, true)
        var neg = val & 0x80000000
        if (neg)
            return (0xffffffff - val + 1) * -1
        else
            return val
    }

    Buffer.prototype.readInt32LE = function (offset, noAssert) {
        return readInt32(this, offset, true, noAssert)
    }

    Buffer.prototype.readInt32BE = function (offset, noAssert) {
        return readInt32(this, offset, false, noAssert)
    }

    function readFloat (buf, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
        }

        return ieee754.read(buf, offset, littleEndian, 23, 4)
    }

    Buffer.prototype.readFloatLE = function (offset, noAssert) {
        return readFloat(this, offset, true, noAssert)
    }

    Buffer.prototype.readFloatBE = function (offset, noAssert) {
        return readFloat(this, offset, false, noAssert)
    }

    function readDouble (buf, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
        }

        return ieee754.read(buf, offset, littleEndian, 52, 8)
    }

    Buffer.prototype.readDoubleLE = function (offset, noAssert) {
        return readDouble(this, offset, true, noAssert)
    }

    Buffer.prototype.readDoubleBE = function (offset, noAssert) {
        return readDouble(this, offset, false, noAssert)
    }

    Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset < this.length, 'trying to write beyond buffer length')
            verifuint(value, 0xff)
        }

        if (offset >= this.length) return

        this[offset] = value
        return offset + 1
    }

    function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
            verifuint(value, 0xffff)
        }

        var len = buf.length
        if (offset >= len)
            return

        for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
            buf[offset + i] =
                (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
                (littleEndian ? i : 1 - i) * 8
        }
        return offset + 2
    }

    Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
        return writeUInt16(this, value, offset, true, noAssert)
    }

    Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
        return writeUInt16(this, value, offset, false, noAssert)
    }

    function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
            verifuint(value, 0xffffffff)
        }

        var len = buf.length
        if (offset >= len)
            return

        for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
            buf[offset + i] =
                (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
        }
        return offset + 4
    }

    Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
        return writeUInt32(this, value, offset, true, noAssert)
    }

    Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
        return writeUInt32(this, value, offset, false, noAssert)
    }

    Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset < this.length, 'Trying to write beyond buffer length')
            verifsint(value, 0x7f, -0x80)
        }

        if (offset >= this.length)
            return

        if (value >= 0)
            this.writeUInt8(value, offset, noAssert)
        else
            this.writeUInt8(0xff + value + 1, offset, noAssert)
        return offset + 1
    }

    function writeInt16 (buf, value, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
            verifsint(value, 0x7fff, -0x8000)
        }

        var len = buf.length
        if (offset >= len)
            return

        if (value >= 0)
            writeUInt16(buf, value, offset, littleEndian, noAssert)
        else
            writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
        return offset + 2
    }

    Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
        return writeInt16(this, value, offset, true, noAssert)
    }

    Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
        return writeInt16(this, value, offset, false, noAssert)
    }

    function writeInt32 (buf, value, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
            verifsint(value, 0x7fffffff, -0x80000000)
        }

        var len = buf.length
        if (offset >= len)
            return

        if (value >= 0)
            writeUInt32(buf, value, offset, littleEndian, noAssert)
        else
            writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
        return offset + 4
    }

    Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
        return writeInt32(this, value, offset, true, noAssert)
    }

    Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
        return writeInt32(this, value, offset, false, noAssert)
    }

    function writeFloat (buf, value, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
            verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
        }

        var len = buf.length
        if (offset >= len)
            return

        ieee754.write(buf, value, offset, littleEndian, 23, 4)
        return offset + 4
    }

    Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert)
    }

    Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert)
    }

    function writeDouble (buf, value, offset, littleEndian, noAssert) {
        if (!noAssert) {
            assert(value !== undefined && value !== null, 'missing value')
            assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
            assert(offset !== undefined && offset !== null, 'missing offset')
            assert(offset + 7 < buf.length,
                'Trying to write beyond buffer length')
            verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
        }

        var len = buf.length
        if (offset >= len)
            return

        ieee754.write(buf, value, offset, littleEndian, 52, 8)
        return offset + 8
    }

    Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert)
    }

    Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert)
    }

// fill(value, start=0, end=buffer.length)
    Buffer.prototype.fill = function (value, start, end) {
        if (!value) value = 0
        if (!start) start = 0
        if (!end) end = this.length

        assert(end >= start, 'end < start')

        // Fill 0 bytes; we're done
        if (end === start) return
        if (this.length === 0) return

        assert(start >= 0 && start < this.length, 'start out of bounds')
        assert(end >= 0 && end <= this.length, 'end out of bounds')

        var i
        if (typeof value === 'number') {
            for (i = start; i < end; i++) {
                this[i] = value
            }
        } else {
            var bytes = utf8ToBytes(value.toString())
            var len = bytes.length
            for (i = start; i < end; i++) {
                this[i] = bytes[i % len]
            }
        }

        return this
    }

    Buffer.prototype.inspect = function () {
        var out = []
        var len = this.length
        for (var i = 0; i < len; i++) {
            out[i] = toHex(this[i])
            if (i === exports.INSPECT_MAX_BYTES) {
                out[i + 1] = '...'
                break
            }
        }
        return '<Buffer ' + out.join(' ') + '>'
    }

    /**
     * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
     * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
     */
    Buffer.prototype.toArrayBuffer = function () {
        if (typeof Uint8Array !== 'undefined') {
            if (Buffer._useTypedArrays) {
                return (new Buffer(this)).buffer
            } else {
                var buf = new Uint8Array(this.length)
                for (var i = 0, len = buf.length; i < len; i += 1) {
                    buf[i] = this[i]
                }
                return buf.buffer
            }
        } else {
            throw new Error('Buffer.toArrayBuffer not supported in this browser')
        }
    }

// HELPER FUNCTIONS
// ================

    var BP = Buffer.prototype

    /**
     * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
     */
    Buffer._augment = function (arr) {
        arr._isBuffer = true

        // save reference to original Uint8Array get/set methods before overwriting
        arr._get = arr.get
        arr._set = arr.set

        // deprecated, will be removed in node 0.13+
        arr.get = BP.get
        arr.set = BP.set

        arr.write = BP.write
        arr.toString = BP.toString
        arr.toLocaleString = BP.toString
        arr.toJSON = BP.toJSON
        arr.equals = BP.equals
        arr.compare = BP.compare
        arr.copy = BP.copy
        arr.slice = BP.slice
        arr.readUInt8 = BP.readUInt8
        arr.readUInt16LE = BP.readUInt16LE
        arr.readUInt16BE = BP.readUInt16BE
        arr.readUInt32LE = BP.readUInt32LE
        arr.readUInt32BE = BP.readUInt32BE
        arr.readInt8 = BP.readInt8
        arr.readInt16LE = BP.readInt16LE
        arr.readInt16BE = BP.readInt16BE
        arr.readInt32LE = BP.readInt32LE
        arr.readInt32BE = BP.readInt32BE
        arr.readFloatLE = BP.readFloatLE
        arr.readFloatBE = BP.readFloatBE
        arr.readDoubleLE = BP.readDoubleLE
        arr.readDoubleBE = BP.readDoubleBE
        arr.writeUInt8 = BP.writeUInt8
        arr.writeUInt16LE = BP.writeUInt16LE
        arr.writeUInt16BE = BP.writeUInt16BE
        arr.writeUInt32LE = BP.writeUInt32LE
        arr.writeUInt32BE = BP.writeUInt32BE
        arr.writeInt8 = BP.writeInt8
        arr.writeInt16LE = BP.writeInt16LE
        arr.writeInt16BE = BP.writeInt16BE
        arr.writeInt32LE = BP.writeInt32LE
        arr.writeInt32BE = BP.writeInt32BE
        arr.writeFloatLE = BP.writeFloatLE
        arr.writeFloatBE = BP.writeFloatBE
        arr.writeDoubleLE = BP.writeDoubleLE
        arr.writeDoubleBE = BP.writeDoubleBE
        arr.fill = BP.fill
        arr.inspect = BP.inspect
        arr.toArrayBuffer = BP.toArrayBuffer

        return arr
    }

    function stringtrim (str) {
        if (str.trim) return str.trim()
        return str.replace(/^\s+|\s+$/g, '')
    }

// slice(start, end)
    function clamp (index, len, defaultValue) {
        if (typeof index !== 'number') return defaultValue
        index = ~~index;  // Coerce to integer.
        if (index >= len) return len
        if (index >= 0) return index
        index += len
        if (index >= 0) return index
        return 0
    }

    function coerce (length) {
        // Coerce length to a number (possibly NaN), round up
        // in case it's fractional (e.g. 123.456) then do a
        // double negate to coerce a NaN to 0. Easy, right?
        length = ~~Math.ceil(+length)
        return length < 0 ? 0 : length
    }

    function isArray (subject) {
        return (Array.isArray || function (subject) {
            return Object.prototype.toString.call(subject) === '[object Array]'
        })(subject)
    }

    function isArrayish (subject) {
        return isArray(subject) || Buffer.isBuffer(subject) ||
            subject && typeof subject === 'object' &&
            typeof subject.length === 'number'
    }

    function toHex (n) {
        if (n < 16) return '0' + n.toString(16)
        return n.toString(16)
    }

    function utf8ToBytes (str) {
        var byteArray = []
        for (var i = 0; i < str.length; i++) {
            var b = str.charCodeAt(i)
            if (b <= 0x7F) {
                byteArray.push(b)
            } else {
                var start = i
                if (b >= 0xD800 && b <= 0xDFFF) i++
                var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
                for (var j = 0; j < h.length; j++) {
                    byteArray.push(parseInt(h[j], 16))
                }
            }
        }
        return byteArray
    }

    function asciiToBytes (str) {
        var byteArray = []
        for (var i = 0; i < str.length; i++) {
            // Node's code seems to be doing this and not & 0x7F..
            byteArray.push(str.charCodeAt(i) & 0xFF)
        }
        return byteArray
    }

    function utf16leToBytes (str) {
        var c, hi, lo
        var byteArray = []
        for (var i = 0; i < str.length; i++) {
            c = str.charCodeAt(i)
            hi = c >> 8
            lo = c % 256
            byteArray.push(lo)
            byteArray.push(hi)
        }

        return byteArray
    }

    function base64ToBytes (str) {
        return base64.toByteArray(str)
    }

    function blitBuffer (src, dst, offset, length) {
        for (var i = 0; i < length; i++) {
            if ((i + offset >= dst.length) || (i >= src.length))
                break
            dst[i + offset] = src[i]
        }
        return i
    }

    function decodeUtf8Char (str) {
        try {
            return decodeURIComponent(str)
        } catch (err) {
            return String.fromCharCode(0xFFFD) // UTF 8 invalid char
        }
    }

    /*
     * We have to make sure that the value is a valid integer. This means that it
     * is non-negative. It has no fractional component and that it does not
     * exceed the maximum allowed value.
     */
    function verifuint (value, max) {
        assert(typeof value === 'number', 'cannot write a non-number as a number')
        assert(value >= 0, 'specified a negative value for writing an unsigned value')
        assert(value <= max, 'value is larger than maximum value for type')
        assert(Math.floor(value) === value, 'value has a fractional component')
    }

    function verifsint (value, max, min) {
        assert(typeof value === 'number', 'cannot write a non-number as a number')
        assert(value <= max, 'value larger than maximum allowed value')
        assert(value >= min, 'value smaller than minimum allowed value')
        assert(Math.floor(value) === value, 'value has a fractional component')
    }

    function verifIEEE754 (value, max, min) {
        assert(typeof value === 'number', 'cannot write a non-number as a number')
        assert(value <= max, 'value larger than maximum allowed value')
        assert(value >= min, 'value smaller than minimum allowed value')
    }

    function assert (test, message) {
        if (!test) throw new Error(message || 'Failed assertion')
    }

},{"base64-js":3,"ieee754":4}],3:[function(require,module,exports){
    var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    ;(function (exports) {
        'use strict';

        var Arr = (typeof Uint8Array !== 'undefined')
            ? Uint8Array
            : Array

        var ZERO   = '0'.charCodeAt(0)
        var PLUS   = '+'.charCodeAt(0)
        var SLASH  = '/'.charCodeAt(0)
        var NUMBER = '0'.charCodeAt(0)
        var LOWER  = 'a'.charCodeAt(0)
        var UPPER  = 'A'.charCodeAt(0)

        function decode (elt) {
            var code = elt.charCodeAt(0)
            if (code === PLUS)
                return 62 // '+'
            if (code === SLASH)
                return 63 // '/'
            if (code < NUMBER)
                return -1 //no match
            if (code < NUMBER + 10)
                return code - NUMBER + 26 + 26
            if (code < UPPER + 26)
                return code - UPPER
            if (code < LOWER + 26)
                return code - LOWER + 26
        }

        function b64ToByteArray (b64) {
            var i, j, l, tmp, placeHolders, arr

            if (b64.length % 4 > 0) {
                throw new Error('Invalid string. Length must be a multiple of 4')
            }

            // the number of equal signs (place holders)
            // if there are two placeholders, than the two characters before it
            // represent one byte
            // if there is only one, then the three characters before it represent 2 bytes
            // this is just a cheap hack to not do indexOf twice
            var len = b64.length
            placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

            // base64 is 4/3 + up to two characters of the original data
            arr = new Arr(b64.length * 3 / 4 - placeHolders)

            // if there are placeholders, only get up to the last complete 4 chars
            l = placeHolders > 0 ? b64.length - 4 : b64.length

            var L = 0

            function push (v) {
                arr[L++] = v
            }

            for (i = 0, j = 0; i < l; i += 4, j += 3) {
                tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
                push((tmp & 0xFF0000) >> 16)
                push((tmp & 0xFF00) >> 8)
                push(tmp & 0xFF)
            }

            if (placeHolders === 2) {
                tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
                push(tmp & 0xFF)
            } else if (placeHolders === 1) {
                tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
                push((tmp >> 8) & 0xFF)
                push(tmp & 0xFF)
            }

            return arr
        }

        function uint8ToBase64 (uint8) {
            var i,
                extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
                output = "",
                temp, length

            function encode (num) {
                return lookup.charAt(num)
            }

            function tripletToBase64 (num) {
                return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
            }

            // go through the array every three bytes, we'll deal with trailing stuff later
            for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
                temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
                output += tripletToBase64(temp)
            }

            // pad the end with zeros, but make sure to not forget the extra bytes
            switch (extraBytes) {
                case 1:
                    temp = uint8[uint8.length - 1]
                    output += encode(temp >> 2)
                    output += encode((temp << 4) & 0x3F)
                    output += '=='
                    break
                case 2:
                    temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
                    output += encode(temp >> 10)
                    output += encode((temp >> 4) & 0x3F)
                    output += encode((temp << 2) & 0x3F)
                    output += '='
                    break
            }

            return output
        }

        module.exports.toByteArray = b64ToByteArray
        module.exports.fromByteArray = uint8ToBase64
    }())

},{}],4:[function(require,module,exports){
    exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e, m,
            eLen = nBytes * 8 - mLen - 1,
            eMax = (1 << eLen) - 1,
            eBias = eMax >> 1,
            nBits = -7,
            i = isLE ? (nBytes - 1) : 0,
            d = isLE ? -1 : 1,
            s = buffer[offset + i];

        i += d;

        e = s & ((1 << (-nBits)) - 1);
        s >>= (-nBits);
        nBits += eLen;
        for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

        m = e & ((1 << (-nBits)) - 1);
        e >>= (-nBits);
        nBits += mLen;
        for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

        if (e === 0) {
            e = 1 - eBias;
        } else if (e === eMax) {
            return m ? NaN : ((s ? -1 : 1) * Infinity);
        } else {
            m = m + Math.pow(2, mLen);
            e = e - eBias;
        }
        return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };

    exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e, m, c,
            eLen = nBytes * 8 - mLen - 1,
            eMax = (1 << eLen) - 1,
            eBias = eMax >> 1,
            rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
            i = isLE ? 0 : (nBytes - 1),
            d = isLE ? 1 : -1,
            s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

        value = Math.abs(value);

        if (isNaN(value) || value === Infinity) {
            m = isNaN(value) ? 1 : 0;
            e = eMax;
        } else {
            e = Math.floor(Math.log(value) / Math.LN2);
            if (value * (c = Math.pow(2, -e)) < 1) {
                e--;
                c *= 2;
            }
            if (e + eBias >= 1) {
                value += rt / c;
            } else {
                value += rt * Math.pow(2, 1 - eBias);
            }
            if (value * c >= 2) {
                e++;
                c /= 2;
            }

            if (e + eBias >= eMax) {
                m = 0;
                e = eMax;
            } else if (e + eBias >= 1) {
                m = (value * c - 1) * Math.pow(2, mLen);
                e = e + eBias;
            } else {
                m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
                e = 0;
            }
        }

        for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

        e = (e << mLen) | m;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

        buffer[offset + i - d] |= s * 128;
    };

},{}],5:[function(require,module,exports){
    var Buffer = require('buffer').Buffer;
    var intSize = 4;
    var zeroBuffer = new Buffer(intSize); zeroBuffer.fill(0);
    var chrsz = 8;

    function toArray(buf, bigEndian) {
        if ((buf.length % intSize) !== 0) {
            var len = buf.length + (intSize - (buf.length % intSize));
            buf = Buffer.concat([buf, zeroBuffer], len);
        }

        var arr = [];
        var fn = bigEndian ? buf.readInt32BE : buf.readInt32LE;
        for (var i = 0; i < buf.length; i += intSize) {
            arr.push(fn.call(buf, i));
        }
        return arr;
    }

    function toBuffer(arr, size, bigEndian) {
        var buf = new Buffer(size);
        var fn = bigEndian ? buf.writeInt32BE : buf.writeInt32LE;
        for (var i = 0; i < arr.length; i++) {
            fn.call(buf, arr[i], i * 4, true);
        }
        return buf;
    }

    function hash(buf, fn, hashSize, bigEndian) {
        if (!Buffer.isBuffer(buf)) buf = new Buffer(buf);
        var arr = fn(toArray(buf, bigEndian), buf.length * chrsz);
        return toBuffer(arr, hashSize, bigEndian);
    }

    module.exports = { hash: hash };

},{"buffer":2}],6:[function(require,module,exports){
    var Buffer = require('buffer').Buffer
    var sha = require('./sha')
    var sha256 = require('./sha256')
    var rng = require('./rng')
    var md5 = require('./md5')

    var algorithms = {
        sha1: sha,
        sha256: sha256,
        md5: md5
    }

    var blocksize = 64
    var zeroBuffer = new Buffer(blocksize); zeroBuffer.fill(0)
    function hmac(fn, key, data) {
        if(!Buffer.isBuffer(key)) key = new Buffer(key)
        if(!Buffer.isBuffer(data)) data = new Buffer(data)

        if(key.length > blocksize) {
            key = fn(key)
        } else if(key.length < blocksize) {
            key = Buffer.concat([key, zeroBuffer], blocksize)
        }

        var ipad = new Buffer(blocksize), opad = new Buffer(blocksize)
        for(var i = 0; i < blocksize; i++) {
            ipad[i] = key[i] ^ 0x36
            opad[i] = key[i] ^ 0x5C
        }

        var hash = fn(Buffer.concat([ipad, data]))
        return fn(Buffer.concat([opad, hash]))
    }

    function hash(alg, key) {
        alg = alg || 'sha1'
        var fn = algorithms[alg]
        var bufs = []
        var length = 0
        if(!fn) error('algorithm:', alg, 'is not yet supported')
        return {
            update: function (data) {
                if(!Buffer.isBuffer(data)) data = new Buffer(data)

                bufs.push(data)
                length += data.length
                return this
            },
            digest: function (enc) {
                var buf = Buffer.concat(bufs)
                var r = key ? hmac(fn, key, buf) : fn(buf)
                bufs = null
                return enc ? r.toString(enc) : r
            }
        }
    }

    function error () {
        var m = [].slice.call(arguments).join(' ')
        throw new Error([
            m,
            'we accept pull requests',
            'http://github.com/dominictarr/crypto-browserify'
        ].join('\n'))
    }

    exports.createHash = function (alg) { return hash(alg) }
    exports.createHmac = function (alg, key) { return hash(alg, key) }
    exports.randomBytes = function(size, callback) {
        if (callback && callback.call) {
            try {
                callback.call(this, undefined, new Buffer(rng(size)))
            } catch (err) { callback(err) }
        } else {
            return new Buffer(rng(size))
        }
    }

    function each(a, f) {
        for(var i in a)
            f(a[i], i)
    }

// the least I can do is make error messages for the rest of the node.js/crypto api.
    each(['createCredentials'
        , 'createCipher'
        , 'createCipheriv'
        , 'createDecipher'
        , 'createDecipheriv'
        , 'createSign'
        , 'createVerify'
        , 'createDiffieHellman'
        , 'pbkdf2'], function (name) {
        exports[name] = function () {
            error('sorry,', name, 'is not implemented yet')
        }
    })

},{"./md5":7,"./rng":8,"./sha":9,"./sha256":10,"buffer":2}],7:[function(require,module,exports){
    /*
     * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
     * Digest Algorithm, as defined in RFC 1321.
     * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
     * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
     * Distributed under the BSD License
     * See http://pajhome.org.uk/crypt/md5 for more info.
     */

    var helpers = require('./helpers');

    /*
     * Perform a simple self-test to see if the VM is working
     */
    function md5_vm_test()
    {
        return hex_md5("abc") == "900150983cd24fb0d6963f7d28e17f72";
    }

    /*
     * Calculate the MD5 of an array of little-endian words, and a bit length
     */
    function core_md5(x, len)
    {
        /* append padding */
        x[len >> 5] |= 0x80 << ((len) % 32);
        x[(((len + 64) >>> 9) << 4) + 14] = len;

        var a =  1732584193;
        var b = -271733879;
        var c = -1732584194;
        var d =  271733878;

        for(var i = 0; i < x.length; i += 16)
        {
            var olda = a;
            var oldb = b;
            var oldc = c;
            var oldd = d;

            a = md5_ff(a, b, c, d, x[i+ 0], 7 , -680876936);
            d = md5_ff(d, a, b, c, x[i+ 1], 12, -389564586);
            c = md5_ff(c, d, a, b, x[i+ 2], 17,  606105819);
            b = md5_ff(b, c, d, a, x[i+ 3], 22, -1044525330);
            a = md5_ff(a, b, c, d, x[i+ 4], 7 , -176418897);
            d = md5_ff(d, a, b, c, x[i+ 5], 12,  1200080426);
            c = md5_ff(c, d, a, b, x[i+ 6], 17, -1473231341);
            b = md5_ff(b, c, d, a, x[i+ 7], 22, -45705983);
            a = md5_ff(a, b, c, d, x[i+ 8], 7 ,  1770035416);
            d = md5_ff(d, a, b, c, x[i+ 9], 12, -1958414417);
            c = md5_ff(c, d, a, b, x[i+10], 17, -42063);
            b = md5_ff(b, c, d, a, x[i+11], 22, -1990404162);
            a = md5_ff(a, b, c, d, x[i+12], 7 ,  1804603682);
            d = md5_ff(d, a, b, c, x[i+13], 12, -40341101);
            c = md5_ff(c, d, a, b, x[i+14], 17, -1502002290);
            b = md5_ff(b, c, d, a, x[i+15], 22,  1236535329);

            a = md5_gg(a, b, c, d, x[i+ 1], 5 , -165796510);
            d = md5_gg(d, a, b, c, x[i+ 6], 9 , -1069501632);
            c = md5_gg(c, d, a, b, x[i+11], 14,  643717713);
            b = md5_gg(b, c, d, a, x[i+ 0], 20, -373897302);
            a = md5_gg(a, b, c, d, x[i+ 5], 5 , -701558691);
            d = md5_gg(d, a, b, c, x[i+10], 9 ,  38016083);
            c = md5_gg(c, d, a, b, x[i+15], 14, -660478335);
            b = md5_gg(b, c, d, a, x[i+ 4], 20, -405537848);
            a = md5_gg(a, b, c, d, x[i+ 9], 5 ,  568446438);
            d = md5_gg(d, a, b, c, x[i+14], 9 , -1019803690);
            c = md5_gg(c, d, a, b, x[i+ 3], 14, -187363961);
            b = md5_gg(b, c, d, a, x[i+ 8], 20,  1163531501);
            a = md5_gg(a, b, c, d, x[i+13], 5 , -1444681467);
            d = md5_gg(d, a, b, c, x[i+ 2], 9 , -51403784);
            c = md5_gg(c, d, a, b, x[i+ 7], 14,  1735328473);
            b = md5_gg(b, c, d, a, x[i+12], 20, -1926607734);

            a = md5_hh(a, b, c, d, x[i+ 5], 4 , -378558);
            d = md5_hh(d, a, b, c, x[i+ 8], 11, -2022574463);
            c = md5_hh(c, d, a, b, x[i+11], 16,  1839030562);
            b = md5_hh(b, c, d, a, x[i+14], 23, -35309556);
            a = md5_hh(a, b, c, d, x[i+ 1], 4 , -1530992060);
            d = md5_hh(d, a, b, c, x[i+ 4], 11,  1272893353);
            c = md5_hh(c, d, a, b, x[i+ 7], 16, -155497632);
            b = md5_hh(b, c, d, a, x[i+10], 23, -1094730640);
            a = md5_hh(a, b, c, d, x[i+13], 4 ,  681279174);
            d = md5_hh(d, a, b, c, x[i+ 0], 11, -358537222);
            c = md5_hh(c, d, a, b, x[i+ 3], 16, -722521979);
            b = md5_hh(b, c, d, a, x[i+ 6], 23,  76029189);
            a = md5_hh(a, b, c, d, x[i+ 9], 4 , -640364487);
            d = md5_hh(d, a, b, c, x[i+12], 11, -421815835);
            c = md5_hh(c, d, a, b, x[i+15], 16,  530742520);
            b = md5_hh(b, c, d, a, x[i+ 2], 23, -995338651);

            a = md5_ii(a, b, c, d, x[i+ 0], 6 , -198630844);
            d = md5_ii(d, a, b, c, x[i+ 7], 10,  1126891415);
            c = md5_ii(c, d, a, b, x[i+14], 15, -1416354905);
            b = md5_ii(b, c, d, a, x[i+ 5], 21, -57434055);
            a = md5_ii(a, b, c, d, x[i+12], 6 ,  1700485571);
            d = md5_ii(d, a, b, c, x[i+ 3], 10, -1894986606);
            c = md5_ii(c, d, a, b, x[i+10], 15, -1051523);
            b = md5_ii(b, c, d, a, x[i+ 1], 21, -2054922799);
            a = md5_ii(a, b, c, d, x[i+ 8], 6 ,  1873313359);
            d = md5_ii(d, a, b, c, x[i+15], 10, -30611744);
            c = md5_ii(c, d, a, b, x[i+ 6], 15, -1560198380);
            b = md5_ii(b, c, d, a, x[i+13], 21,  1309151649);
            a = md5_ii(a, b, c, d, x[i+ 4], 6 , -145523070);
            d = md5_ii(d, a, b, c, x[i+11], 10, -1120210379);
            c = md5_ii(c, d, a, b, x[i+ 2], 15,  718787259);
            b = md5_ii(b, c, d, a, x[i+ 9], 21, -343485551);

            a = safe_add(a, olda);
            b = safe_add(b, oldb);
            c = safe_add(c, oldc);
            d = safe_add(d, oldd);
        }
        return Array(a, b, c, d);

    }

    /*
     * These functions implement the four basic operations the algorithm uses.
     */
    function md5_cmn(q, a, b, x, s, t)
    {
        return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s),b);
    }
    function md5_ff(a, b, c, d, x, s, t)
    {
        return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }
    function md5_gg(a, b, c, d, x, s, t)
    {
        return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }
    function md5_hh(a, b, c, d, x, s, t)
    {
        return md5_cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5_ii(a, b, c, d, x, s, t)
    {
        return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
    }

    /*
     * Add integers, wrapping at 2^32. This uses 16-bit operations internally
     * to work around bugs in some JS interpreters.
     */
    function safe_add(x, y)
    {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }

    /*
     * Bitwise rotate a 32-bit number to the left.
     */
    function bit_rol(num, cnt)
    {
        return (num << cnt) | (num >>> (32 - cnt));
    }

    module.exports = function md5(buf) {
        return helpers.hash(buf, core_md5, 16);
    };

},{"./helpers":5}],8:[function(require,module,exports){
// Original code adapted from Robert Kieffer.
// details at https://github.com/broofa/node-uuid
    (function() {
        var _global = this;

        var mathRNG, whatwgRNG;

        // NOTE: Math.random() does not guarantee "cryptographic quality"
        mathRNG = function(size) {
            var bytes = new Array(size);
            var r;

            for (var i = 0, r; i < size; i++) {
                if ((i & 0x03) == 0) r = Math.random() * 0x100000000;
                bytes[i] = r >>> ((i & 0x03) << 3) & 0xff;
            }

            return bytes;
        }

        if (_global.crypto && crypto.getRandomValues) {
            whatwgRNG = function(size) {
                var bytes = new Uint8Array(size);
                crypto.getRandomValues(bytes);
                return bytes;
            }
        }

        module.exports = whatwgRNG || mathRNG;

    }())

},{}],9:[function(require,module,exports){
    /*
     * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
     * in FIPS PUB 180-1
     * Version 2.1a Copyright Paul Johnston 2000 - 2002.
     * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
     * Distributed under the BSD License
     * See http://pajhome.org.uk/crypt/md5 for details.
     */

    var helpers = require('./helpers');

    /*
     * Calculate the SHA-1 of an array of big-endian words, and a bit length
     */
    function core_sha1(x, len)
    {
        /* append padding */
        x[len >> 5] |= 0x80 << (24 - len % 32);
        x[((len + 64 >> 9) << 4) + 15] = len;

        var w = Array(80);
        var a =  1732584193;
        var b = -271733879;
        var c = -1732584194;
        var d =  271733878;
        var e = -1009589776;

        for(var i = 0; i < x.length; i += 16)
        {
            var olda = a;
            var oldb = b;
            var oldc = c;
            var oldd = d;
            var olde = e;

            for(var j = 0; j < 80; j++)
            {
                if(j < 16) w[j] = x[i + j];
                else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
                var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                    safe_add(safe_add(e, w[j]), sha1_kt(j)));
                e = d;
                d = c;
                c = rol(b, 30);
                b = a;
                a = t;
            }

            a = safe_add(a, olda);
            b = safe_add(b, oldb);
            c = safe_add(c, oldc);
            d = safe_add(d, oldd);
            e = safe_add(e, olde);
        }
        return Array(a, b, c, d, e);

    }

    /*
     * Perform the appropriate triplet combination function for the current
     * iteration
     */
    function sha1_ft(t, b, c, d)
    {
        if(t < 20) return (b & c) | ((~b) & d);
        if(t < 40) return b ^ c ^ d;
        if(t < 60) return (b & c) | (b & d) | (c & d);
        return b ^ c ^ d;
    }

    /*
     * Determine the appropriate additive constant for the current iteration
     */
    function sha1_kt(t)
    {
        return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
            (t < 60) ? -1894007588 : -899497514;
    }

    /*
     * Add integers, wrapping at 2^32. This uses 16-bit operations internally
     * to work around bugs in some JS interpreters.
     */
    function safe_add(x, y)
    {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }

    /*
     * Bitwise rotate a 32-bit number to the left.
     */
    function rol(num, cnt)
    {
        return (num << cnt) | (num >>> (32 - cnt));
    }

    module.exports = function sha1(buf) {
        return helpers.hash(buf, core_sha1, 20, true);
    };

},{"./helpers":5}],10:[function(require,module,exports){

    /**
     * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
     * in FIPS 180-2
     * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
     * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
     *
     */

    var helpers = require('./helpers');

    var safe_add = function(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    };

    var S = function(X, n) {
        return (X >>> n) | (X << (32 - n));
    };

    var R = function(X, n) {
        return (X >>> n);
    };

    var Ch = function(x, y, z) {
        return ((x & y) ^ ((~x) & z));
    };

    var Maj = function(x, y, z) {
        return ((x & y) ^ (x & z) ^ (y & z));
    };

    var Sigma0256 = function(x) {
        return (S(x, 2) ^ S(x, 13) ^ S(x, 22));
    };

    var Sigma1256 = function(x) {
        return (S(x, 6) ^ S(x, 11) ^ S(x, 25));
    };

    var Gamma0256 = function(x) {
        return (S(x, 7) ^ S(x, 18) ^ R(x, 3));
    };

    var Gamma1256 = function(x) {
        return (S(x, 17) ^ S(x, 19) ^ R(x, 10));
    };

    var core_sha256 = function(m, l) {
        var K = new Array(0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0xFC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x6CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2);
        var HASH = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
        var W = new Array(64);
        var a, b, c, d, e, f, g, h, i, j;
        var T1, T2;
        /* append padding */
        m[l >> 5] |= 0x80 << (24 - l % 32);
        m[((l + 64 >> 9) << 4) + 15] = l;
        for (var i = 0; i < m.length; i += 16) {
            a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
            for (var j = 0; j < 64; j++) {
                if (j < 16) {
                    W[j] = m[j + i];
                } else {
                    W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
                }
                T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
                T2 = safe_add(Sigma0256(a), Maj(a, b, c));
                h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
            }
            HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
            HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
        }
        return HASH;
    };

    module.exports = function sha256(buf) {
        return helpers.hash(buf, core_sha256, 32, true);
    };

},{"./helpers":5}],11:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

    function EventEmitter() {
        this._events = this._events || {};
        this._maxListeners = this._maxListeners || undefined;
    }
    module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
    EventEmitter.EventEmitter = EventEmitter;

    EventEmitter.prototype._events = undefined;
    EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
    EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
    EventEmitter.prototype.setMaxListeners = function(n) {
        if (!isNumber(n) || n < 0 || isNaN(n))
            throw TypeError('n must be a positive number');
        this._maxListeners = n;
        return this;
    };

    EventEmitter.prototype.emit = function(type) {
        var er, handler, len, args, i, listeners;

        if (!this._events)
            this._events = {};

        // If there is no 'error' event listener then throw.
        if (type === 'error') {
            if (!this._events.error ||
                (isObject(this._events.error) && !this._events.error.length)) {
                er = arguments[1];
                if (er instanceof Error) {
                    throw er; // Unhandled 'error' event
                } else {
                    throw TypeError('Uncaught, unspecified "error" event.');
                }
                return false;
            }
        }

        handler = this._events[type];

        if (isUndefined(handler))
            return false;

        if (isFunction(handler)) {
            switch (arguments.length) {
                // fast cases
                case 1:
                    handler.call(this);
                    break;
                case 2:
                    handler.call(this, arguments[1]);
                    break;
                case 3:
                    handler.call(this, arguments[1], arguments[2]);
                    break;
                // slower
                default:
                    len = arguments.length;
                    args = new Array(len - 1);
                    for (i = 1; i < len; i++)
                        args[i - 1] = arguments[i];
                    handler.apply(this, args);
            }
        } else if (isObject(handler)) {
            len = arguments.length;
            args = new Array(len - 1);
            for (i = 1; i < len; i++)
                args[i - 1] = arguments[i];

            listeners = handler.slice();
            len = listeners.length;
            for (i = 0; i < len; i++)
                listeners[i].apply(this, args);
        }

        return true;
    };

    EventEmitter.prototype.addListener = function(type, listener) {
        var m;

        if (!isFunction(listener))
            throw TypeError('listener must be a function');

        if (!this._events)
            this._events = {};

        // To avoid recursion in the case that type === "newListener"! Before
        // adding it to the listeners, first emit "newListener".
        if (this._events.newListener)
            this.emit('newListener', type,
                isFunction(listener.listener) ?
                    listener.listener : listener);

        if (!this._events[type])
        // Optimize the case of one listener. Don't need the extra array object.
            this._events[type] = listener;
        else if (isObject(this._events[type]))
        // If we've already got an array, just append.
            this._events[type].push(listener);
        else
        // Adding the second element, need to change to array.
            this._events[type] = [this._events[type], listener];

        // Check for listener leak
        if (isObject(this._events[type]) && !this._events[type].warned) {
            var m;
            if (!isUndefined(this._maxListeners)) {
                m = this._maxListeners;
            } else {
                m = EventEmitter.defaultMaxListeners;
            }

            if (m && m > 0 && this._events[type].length > m) {
                this._events[type].warned = true;
                console.error('(node) warning: possible EventEmitter memory ' +
                        'leak detected. %d listeners added. ' +
                        'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
                if (typeof console.trace === 'function') {
                    // not supported in IE 10
                    console.trace();
                }
            }
        }

        return this;
    };

    EventEmitter.prototype.on = EventEmitter.prototype.addListener;

    EventEmitter.prototype.once = function(type, listener) {
        if (!isFunction(listener))
            throw TypeError('listener must be a function');

        var fired = false;

        function g() {
            this.removeListener(type, g);

            if (!fired) {
                fired = true;
                listener.apply(this, arguments);
            }
        }

        g.listener = listener;
        this.on(type, g);

        return this;
    };

// emits a 'removeListener' event iff the listener was removed
    EventEmitter.prototype.removeListener = function(type, listener) {
        var list, position, length, i;

        if (!isFunction(listener))
            throw TypeError('listener must be a function');

        if (!this._events || !this._events[type])
            return this;

        list = this._events[type];
        length = list.length;
        position = -1;

        if (list === listener ||
            (isFunction(list.listener) && list.listener === listener)) {
            delete this._events[type];
            if (this._events.removeListener)
                this.emit('removeListener', type, listener);

        } else if (isObject(list)) {
            for (i = length; i-- > 0;) {
                if (list[i] === listener ||
                    (list[i].listener && list[i].listener === listener)) {
                    position = i;
                    break;
                }
            }

            if (position < 0)
                return this;

            if (list.length === 1) {
                list.length = 0;
                delete this._events[type];
            } else {
                list.splice(position, 1);
            }

            if (this._events.removeListener)
                this.emit('removeListener', type, listener);
        }

        return this;
    };

    EventEmitter.prototype.removeAllListeners = function(type) {
        var key, listeners;

        if (!this._events)
            return this;

        // not listening for removeListener, no need to emit
        if (!this._events.removeListener) {
            if (arguments.length === 0)
                this._events = {};
            else if (this._events[type])
                delete this._events[type];
            return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
            for (key in this._events) {
                if (key === 'removeListener') continue;
                this.removeAllListeners(key);
            }
            this.removeAllListeners('removeListener');
            this._events = {};
            return this;
        }

        listeners = this._events[type];

        if (isFunction(listeners)) {
            this.removeListener(type, listeners);
        } else {
            // LIFO order
            while (listeners.length)
                this.removeListener(type, listeners[listeners.length - 1]);
        }
        delete this._events[type];

        return this;
    };

    EventEmitter.prototype.listeners = function(type) {
        var ret;
        if (!this._events || !this._events[type])
            ret = [];
        else if (isFunction(this._events[type]))
            ret = [this._events[type]];
        else
            ret = this._events[type].slice();
        return ret;
    };

    EventEmitter.listenerCount = function(emitter, type) {
        var ret;
        if (!emitter._events || !emitter._events[type])
            ret = 0;
        else if (isFunction(emitter._events[type]))
            ret = 1;
        else
            ret = emitter._events[type].length;
        return ret;
    };

    function isFunction(arg) {
        return typeof arg === 'function';
    }

    function isNumber(arg) {
        return typeof arg === 'number';
    }

    function isObject(arg) {
        return typeof arg === 'object' && arg !== null;
    }

    function isUndefined(arg) {
        return arg === void 0;
    }

},{}],12:[function(require,module,exports){
    var http = module.exports;
    var EventEmitter = require('events').EventEmitter;
    var Request = require('./lib/request');
    var url = require('url')

    http.request = function (params, cb) {
        if (typeof params === 'string') {
            params = url.parse(params)
        }
        if (!params) params = {};
        if (!params.host && !params.port) {
            params.port = parseInt(window.location.port, 10);
        }
        if (!params.host && params.hostname) {
            params.host = params.hostname;
        }

        if (!params.scheme) params.scheme = window.location.protocol.split(':')[0];
        if (!params.host) {
            params.host = window.location.hostname || window.location.host;
        }
        if (/:/.test(params.host)) {
            if (!params.port) {
                params.port = params.host.split(':')[1];
            }
            params.host = params.host.split(':')[0];
        }
        if (!params.port) params.port = params.scheme == 'https' ? 443 : 80;

        var req = new Request(new xhrHttp, params);
        if (cb) req.on('response', cb);
        return req;
    };

    http.get = function (params, cb) {
        params.method = 'GET';
        var req = http.request(params, cb);
        req.end();
        return req;
    };

    http.Agent = function () {};
    http.Agent.defaultMaxSockets = 4;

    var xhrHttp = (function () {
        if (typeof window === 'undefined') {
            throw new Error('no window object present');
        }
        else if (window.XMLHttpRequest) {
            return window.XMLHttpRequest;
        }
        else if (window.ActiveXObject) {
            var axs = [
                'Msxml2.XMLHTTP.6.0',
                'Msxml2.XMLHTTP.3.0',
                'Microsoft.XMLHTTP'
            ];
            for (var i = 0; i < axs.length; i++) {
                try {
                    var ax = new(window.ActiveXObject)(axs[i]);
                    return function () {
                        if (ax) {
                            var ax_ = ax;
                            ax = null;
                            return ax_;
                        }
                        else {
                            return new(window.ActiveXObject)(axs[i]);
                        }
                    };
                }
                catch (e) {}
            }
            throw new Error('ajax not supported in this browser')
        }
        else {
            throw new Error('ajax not supported in this browser');
        }
    })();

    http.STATUS_CODES = {
        100 : 'Continue',
        101 : 'Switching Protocols',
        102 : 'Processing',                 // RFC 2518, obsoleted by RFC 4918
        200 : 'OK',
        201 : 'Created',
        202 : 'Accepted',
        203 : 'Non-Authoritative Information',
        204 : 'No Content',
        205 : 'Reset Content',
        206 : 'Partial Content',
        207 : 'Multi-Status',               // RFC 4918
        300 : 'Multiple Choices',
        301 : 'Moved Permanently',
        302 : 'Moved Temporarily',
        303 : 'See Other',
        304 : 'Not Modified',
        305 : 'Use Proxy',
        307 : 'Temporary Redirect',
        400 : 'Bad Request',
        401 : 'Unauthorized',
        402 : 'Payment Required',
        403 : 'Forbidden',
        404 : 'Not Found',
        405 : 'Method Not Allowed',
        406 : 'Not Acceptable',
        407 : 'Proxy Authentication Required',
        408 : 'Request Time-out',
        409 : 'Conflict',
        410 : 'Gone',
        411 : 'Length Required',
        412 : 'Precondition Failed',
        413 : 'Request Entity Too Large',
        414 : 'Request-URI Too Large',
        415 : 'Unsupported Media Type',
        416 : 'Requested Range Not Satisfiable',
        417 : 'Expectation Failed',
        418 : 'I\'m a teapot',              // RFC 2324
        422 : 'Unprocessable Entity',       // RFC 4918
        423 : 'Locked',                     // RFC 4918
        424 : 'Failed Dependency',          // RFC 4918
        425 : 'Unordered Collection',       // RFC 4918
        426 : 'Upgrade Required',           // RFC 2817
        428 : 'Precondition Required',      // RFC 6585
        429 : 'Too Many Requests',          // RFC 6585
        431 : 'Request Header Fields Too Large',// RFC 6585
        500 : 'Internal Server Error',
        501 : 'Not Implemented',
        502 : 'Bad Gateway',
        503 : 'Service Unavailable',
        504 : 'Gateway Time-out',
        505 : 'HTTP Version Not Supported',
        506 : 'Variant Also Negotiates',    // RFC 2295
        507 : 'Insufficient Storage',       // RFC 4918
        509 : 'Bandwidth Limit Exceeded',
        510 : 'Not Extended',               // RFC 2774
        511 : 'Network Authentication Required' // RFC 6585
    };
},{"./lib/request":13,"events":11,"url":36}],13:[function(require,module,exports){
    var Stream = require('stream');
    var Response = require('./response');
    var Base64 = require('Base64');
    var inherits = require('inherits');

    var Request = module.exports = function (xhr, params) {
        var self = this;
        self.writable = true;
        self.xhr = xhr;
        self.body = [];

        self.uri = (params.scheme || 'http') + '://'
            + params.host
            + (params.port ? ':' + params.port : '')
            + (params.path || '/')
        ;

        if (typeof params.withCredentials === 'undefined') {
            params.withCredentials = true;
        }

        try { xhr.withCredentials = params.withCredentials }
        catch (e) {}

        xhr.open(
                params.method || 'GET',
            self.uri,
            true
        );

        self._headers = {};

        if (params.headers) {
            var keys = objectKeys(params.headers);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                if (!self.isSafeRequestHeader(key)) continue;
                var value = params.headers[key];
                self.setHeader(key, value);
            }
        }

        if (params.auth) {
            //basic auth
            this.setHeader('Authorization', 'Basic ' + Base64.btoa(params.auth));
        }

        var res = new Response;
        res.on('close', function () {
            self.emit('close');
        });

        res.on('ready', function () {
            self.emit('response', res);
        });

        xhr.onreadystatechange = function () {
            // Fix for IE9 bug
            // SCRIPT575: Could not complete the operation due to error c00c023f
            // It happens when a request is aborted, calling the success callback anyway with readyState === 4
            if (xhr.__aborted) return;
            res.handle(xhr);
        };
    };

    inherits(Request, Stream);

    Request.prototype.setHeader = function (key, value) {
        this._headers[key.toLowerCase()] = value
    };

    Request.prototype.getHeader = function (key) {
        return this._headers[key.toLowerCase()]
    };

    Request.prototype.removeHeader = function (key) {
        delete this._headers[key.toLowerCase()]
    };

    Request.prototype.write = function (s) {
        this.body.push(s);
    };

    Request.prototype.destroy = function (s) {
        this.xhr.__aborted = true;
        this.xhr.abort();
        this.emit('close');
    };

    Request.prototype.end = function (s) {
        if (s !== undefined) this.body.push(s);

        var keys = objectKeys(this._headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = this._headers[key];
            if (isArray(value)) {
                for (var j = 0; j < value.length; j++) {
                    this.xhr.setRequestHeader(key, value[j]);
                }
            }
            else this.xhr.setRequestHeader(key, value)
        }

        if (this.body.length === 0) {
            this.xhr.send('');
        }
        else if (typeof this.body[0] === 'string') {
            this.xhr.send(this.body.join(''));
        }
        else if (isArray(this.body[0])) {
            var body = [];
            for (var i = 0; i < this.body.length; i++) {
                body.push.apply(body, this.body[i]);
            }
            this.xhr.send(body);
        }
        else if (/Array/.test(Object.prototype.toString.call(this.body[0]))) {
            var len = 0;
            for (var i = 0; i < this.body.length; i++) {
                len += this.body[i].length;
            }
            var body = new(this.body[0].constructor)(len);
            var k = 0;

            for (var i = 0; i < this.body.length; i++) {
                var b = this.body[i];
                for (var j = 0; j < b.length; j++) {
                    body[k++] = b[j];
                }
            }
            this.xhr.send(body);
        }
        else {
            var body = '';
            for (var i = 0; i < this.body.length; i++) {
                body += this.body[i].toString();
            }
            this.xhr.send(body);
        }
    };

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
    Request.unsafeHeaders = [
        "accept-charset",
        "accept-encoding",
        "access-control-request-headers",
        "access-control-request-method",
        "connection",
        "content-length",
        "cookie",
        "cookie2",
        "content-transfer-encoding",
        "date",
        "expect",
        "host",
        "keep-alive",
        "origin",
        "referer",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "user-agent",
        "via"
    ];

    Request.prototype.isSafeRequestHeader = function (headerName) {
        if (!headerName) return false;
        return indexOf(Request.unsafeHeaders, headerName.toLowerCase()) === -1;
    };

    var objectKeys = Object.keys || function (obj) {
        var keys = [];
        for (var key in obj) keys.push(key);
        return keys;
    };

    var isArray = Array.isArray || function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]';
    };

    var indexOf = function (xs, x) {
        if (xs.indexOf) return xs.indexOf(x);
        for (var i = 0; i < xs.length; i++) {
            if (xs[i] === x) return i;
        }
        return -1;
    };

},{"./response":14,"Base64":15,"inherits":16,"stream":35}],14:[function(require,module,exports){
    var Stream = require('stream');
    var util = require('util');

    var Response = module.exports = function (res) {
        this.offset = 0;
        this.readable = true;
    };

    util.inherits(Response, Stream);

    var capable = {
        streaming : true,
        status2 : true
    };

    function parseHeaders (res) {
        var lines = res.getAllResponseHeaders().split(/\r?\n/);
        var headers = {};
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line === '') continue;

            var m = line.match(/^([^:]+):\s*(.*)/);
            if (m) {
                var key = m[1].toLowerCase(), value = m[2];

                if (headers[key] !== undefined) {

                    if (isArray(headers[key])) {
                        headers[key].push(value);
                    }
                    else {
                        headers[key] = [ headers[key], value ];
                    }
                }
                else {
                    headers[key] = value;
                }
            }
            else {
                headers[line] = true;
            }
        }
        return headers;
    }

    Response.prototype.getResponse = function (xhr) {
        var respType = String(xhr.responseType).toLowerCase();
        if (respType === 'blob') return xhr.responseBlob || xhr.response;
        if (respType === 'arraybuffer') return xhr.response;
        return xhr.responseText;
    }

    Response.prototype.getHeader = function (key) {
        return this.headers[key.toLowerCase()];
    };

    Response.prototype.handle = function (res) {
        if (res.readyState === 2 && capable.status2) {
            try {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
            }
            catch (err) {
                capable.status2 = false;
            }

            if (capable.status2) {
                this.emit('ready');
            }
        }
        else if (capable.streaming && res.readyState === 3) {
            try {
                if (!this.statusCode) {
                    this.statusCode = res.status;
                    this.headers = parseHeaders(res);
                    this.emit('ready');
                }
            }
            catch (err) {}

            try {
                this._emitData(res);
            }
            catch (err) {
                capable.streaming = false;
            }
        }
        else if (res.readyState === 4) {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.emit('ready');
            }
            this._emitData(res);

            if (res.error) {
                this.emit('error', this.getResponse(res));
            }
            else this.emit('end');

            this.emit('close');
        }
    };

    Response.prototype._emitData = function (res) {
        var respBody = this.getResponse(res);
        if (respBody.toString().match(/ArrayBuffer/)) {
            this.emit('data', new Uint8Array(respBody, this.offset));
            this.offset = respBody.byteLength;
            return;
        }
        if (respBody.length > this.offset) {
            this.emit('data', respBody.slice(this.offset));
            this.offset = respBody.length;
        }
    };

    var isArray = Array.isArray || function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]';
    };

},{"stream":35,"util":38}],15:[function(require,module,exports){
    ;(function () {

        var object = typeof exports != 'undefined' ? exports : this; // #8: web workers
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

        function InvalidCharacterError(message) {
            this.message = message;
        }
        InvalidCharacterError.prototype = new Error;
        InvalidCharacterError.prototype.name = 'InvalidCharacterError';

        // encoder
        // [https://gist.github.com/999166] by [https://github.com/nignag]
        object.btoa || (
            object.btoa = function (input) {
                for (
                    // initialize result and counter
                    var block, charCode, idx = 0, map = chars, output = '';
                    // if the next input index does not exist:
                    //   change the mapping table to "="
                    //   check if d has no fractional digits
                    input.charAt(idx | 0) || (map = '=', idx % 1);
                    // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
                    output += map.charAt(63 & block >> 8 - idx % 1 * 8)
                    ) {
                    charCode = input.charCodeAt(idx += 3/4);
                    if (charCode > 0xFF) {
                        throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
                    }
                    block = block << 8 | charCode;
                }
                return output;
            });

        // decoder
        // [https://gist.github.com/1020396] by [https://github.com/atk]
        object.atob || (
            object.atob = function (input) {
                input = input.replace(/=+$/, '');
                if (input.length % 4 == 1) {
                    throw new InvalidCharacterError("'atob' failed: The string to be decoded is not correctly encoded.");
                }
                for (
                    // initialize result and counters
                    var bc = 0, bs, buffer, idx = 0, output = '';
                    // get next character
                    buffer = input.charAt(idx++);
                    // character found in table? initialize bit storage and add its ascii value;
                    ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
                        // and if not first of each 4 characters,
                        // convert the first 8 bits to one ascii character
                        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
                    ) {
                    // try to find character in table (0-63, not found => -1)
                    buffer = chars.indexOf(buffer);
                }
                return output;
            });

    }());

},{}],16:[function(require,module,exports){
    if (typeof Object.create === 'function') {
        // implementation from standard node.js 'util' module
        module.exports = function inherits(ctor, superCtor) {
            ctor.super_ = superCtor
            ctor.prototype = Object.create(superCtor.prototype, {
                constructor: {
                    value: ctor,
                    enumerable: false,
                    writable: true,
                    configurable: true
                }
            });
        };
    } else {
        // old school shim for old browsers
        module.exports = function inherits(ctor, superCtor) {
            ctor.super_ = superCtor
            var TempCtor = function () {}
            TempCtor.prototype = superCtor.prototype
            ctor.prototype = new TempCtor()
            ctor.prototype.constructor = ctor
        }
    }

},{}],17:[function(require,module,exports){
// shim for using process in browser

    var process = module.exports = {};

    process.nextTick = (function () {
        var canSetImmediate = typeof window !== 'undefined'
            && window.setImmediate;
        var canPost = typeof window !== 'undefined'
                && window.postMessage && window.addEventListener
            ;

        if (canSetImmediate) {
            return function (f) { return window.setImmediate(f) };
        }

        if (canPost) {
            var queue = [];
            window.addEventListener('message', function (ev) {
                var source = ev.source;
                if ((source === window || source === null) && ev.data === 'process-tick') {
                    ev.stopPropagation();
                    if (queue.length > 0) {
                        var fn = queue.shift();
                        fn();
                    }
                }
            }, true);

            return function nextTick(fn) {
                queue.push(fn);
                window.postMessage('process-tick', '*');
            };
        }

        return function nextTick(fn) {
            setTimeout(fn, 0);
        };
    })();

    process.title = 'browser';
    process.browser = true;
    process.env = {};
    process.argv = [];

    function noop() {}

    process.on = noop;
    process.addListener = noop;
    process.once = noop;
    process.off = noop;
    process.removeListener = noop;
    process.removeAllListeners = noop;
    process.emit = noop;

    process.binding = function (name) {
        throw new Error('process.binding is not supported');
    }

// TODO(shtylman)
    process.cwd = function () { return '/' };
    process.chdir = function (dir) {
        throw new Error('process.chdir is not supported');
    };

},{}],18:[function(require,module,exports){
    (function (global){
        /*! http://mths.be/punycode v1.2.4 by @mathias */
        ;(function(root) {

            /** Detect free variables */
            var freeExports = typeof exports == 'object' && exports;
            var freeModule = typeof module == 'object' && module &&
                module.exports == freeExports && module;
            var freeGlobal = typeof global == 'object' && global;
            if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
                root = freeGlobal;
            }

            /**
             * The `punycode` object.
             * @name punycode
             * @type Object
             */
            var punycode,

                /** Highest positive signed 32-bit float value */
                maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

                /** Bootstring parameters */
                base = 36,
                tMin = 1,
                tMax = 26,
                skew = 38,
                damp = 700,
                initialBias = 72,
                initialN = 128, // 0x80
                delimiter = '-', // '\x2D'

                /** Regular expressions */
                regexPunycode = /^xn--/,
                regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
                regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

                /** Error messages */
                errors = {
                    'overflow': 'Overflow: input needs wider integers to process',
                    'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
                    'invalid-input': 'Invalid input'
                },

                /** Convenience shortcuts */
                baseMinusTMin = base - tMin,
                floor = Math.floor,
                stringFromCharCode = String.fromCharCode,

                /** Temporary variable */
                key;

            /*--------------------------------------------------------------------------*/

            /**
             * A generic error utility function.
             * @private
             * @param {String} type The error type.
             * @returns {Error} Throws a `RangeError` with the applicable error message.
             */
            function error(type) {
                throw RangeError(errors[type]);
            }

            /**
             * A generic `Array#map` utility function.
             * @private
             * @param {Array} array The array to iterate over.
             * @param {Function} callback The function that gets called for every array
             * item.
             * @returns {Array} A new array of values returned by the callback function.
             */
            function map(array, fn) {
                var length = array.length;
                while (length--) {
                    array[length] = fn(array[length]);
                }
                return array;
            }

            /**
             * A simple `Array#map`-like wrapper to work with domain name strings.
             * @private
             * @param {String} domain The domain name.
             * @param {Function} callback The function that gets called for every
             * character.
             * @returns {Array} A new string of characters returned by the callback
             * function.
             */
            function mapDomain(string, fn) {
                return map(string.split(regexSeparators), fn).join('.');
            }

            /**
             * Creates an array containing the numeric code points of each Unicode
             * character in the string. While JavaScript uses UCS-2 internally,
             * this function will convert a pair of surrogate halves (each of which
             * UCS-2 exposes as separate characters) into a single code point,
             * matching UTF-16.
             * @see `punycode.ucs2.encode`
             * @see <http://mathiasbynens.be/notes/javascript-encoding>
             * @memberOf punycode.ucs2
             * @name decode
             * @param {String} string The Unicode input string (UCS-2).
             * @returns {Array} The new array of code points.
             */
            function ucs2decode(string) {
                var output = [],
                    counter = 0,
                    length = string.length,
                    value,
                    extra;
                while (counter < length) {
                    value = string.charCodeAt(counter++);
                    if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
                        // high surrogate, and there is a next character
                        extra = string.charCodeAt(counter++);
                        if ((extra & 0xFC00) == 0xDC00) { // low surrogate
                            output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
                        } else {
                            // unmatched surrogate; only append this code unit, in case the next
                            // code unit is the high surrogate of a surrogate pair
                            output.push(value);
                            counter--;
                        }
                    } else {
                        output.push(value);
                    }
                }
                return output;
            }

            /**
             * Creates a string based on an array of numeric code points.
             * @see `punycode.ucs2.decode`
             * @memberOf punycode.ucs2
             * @name encode
             * @param {Array} codePoints The array of numeric code points.
             * @returns {String} The new Unicode string (UCS-2).
             */
            function ucs2encode(array) {
                return map(array, function(value) {
                    var output = '';
                    if (value > 0xFFFF) {
                        value -= 0x10000;
                        output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
                        value = 0xDC00 | value & 0x3FF;
                    }
                    output += stringFromCharCode(value);
                    return output;
                }).join('');
            }

            /**
             * Converts a basic code point into a digit/integer.
             * @see `digitToBasic()`
             * @private
             * @param {Number} codePoint The basic numeric code point value.
             * @returns {Number} The numeric value of a basic code point (for use in
             * representing integers) in the range `0` to `base - 1`, or `base` if
             * the code point does not represent a value.
             */
            function basicToDigit(codePoint) {
                if (codePoint - 48 < 10) {
                    return codePoint - 22;
                }
                if (codePoint - 65 < 26) {
                    return codePoint - 65;
                }
                if (codePoint - 97 < 26) {
                    return codePoint - 97;
                }
                return base;
            }

            /**
             * Converts a digit/integer into a basic code point.
             * @see `basicToDigit()`
             * @private
             * @param {Number} digit The numeric value of a basic code point.
             * @returns {Number} The basic code point whose value (when used for
             * representing integers) is `digit`, which needs to be in the range
             * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
             * used; else, the lowercase form is used. The behavior is undefined
             * if `flag` is non-zero and `digit` has no uppercase form.
             */
            function digitToBasic(digit, flag) {
                //  0..25 map to ASCII a..z or A..Z
                // 26..35 map to ASCII 0..9
                return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
            }

            /**
             * Bias adaptation function as per section 3.4 of RFC 3492.
             * http://tools.ietf.org/html/rfc3492#section-3.4
             * @private
             */
            function adapt(delta, numPoints, firstTime) {
                var k = 0;
                delta = firstTime ? floor(delta / damp) : delta >> 1;
                delta += floor(delta / numPoints);
                for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
                    delta = floor(delta / baseMinusTMin);
                }
                return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
            }

            /**
             * Converts a Punycode string of ASCII-only symbols to a string of Unicode
             * symbols.
             * @memberOf punycode
             * @param {String} input The Punycode string of ASCII-only symbols.
             * @returns {String} The resulting string of Unicode symbols.
             */
            function decode(input) {
                // Don't use UCS-2
                var output = [],
                    inputLength = input.length,
                    out,
                    i = 0,
                    n = initialN,
                    bias = initialBias,
                    basic,
                    j,
                    index,
                    oldi,
                    w,
                    k,
                    digit,
                    t,
                    /** Cached calculation results */
                    baseMinusT;

                // Handle the basic code points: let `basic` be the number of input code
                // points before the last delimiter, or `0` if there is none, then copy
                // the first basic code points to the output.

                basic = input.lastIndexOf(delimiter);
                if (basic < 0) {
                    basic = 0;
                }

                for (j = 0; j < basic; ++j) {
                    // if it's not a basic code point
                    if (input.charCodeAt(j) >= 0x80) {
                        error('not-basic');
                    }
                    output.push(input.charCodeAt(j));
                }

                // Main decoding loop: start just after the last delimiter if any basic code
                // points were copied; start at the beginning otherwise.

                for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

                    // `index` is the index of the next character to be consumed.
                    // Decode a generalized variable-length integer into `delta`,
                    // which gets added to `i`. The overflow checking is easier
                    // if we increase `i` as we go, then subtract off its starting
                    // value at the end to obtain `delta`.
                    for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

                        if (index >= inputLength) {
                            error('invalid-input');
                        }

                        digit = basicToDigit(input.charCodeAt(index++));

                        if (digit >= base || digit > floor((maxInt - i) / w)) {
                            error('overflow');
                        }

                        i += digit * w;
                        t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

                        if (digit < t) {
                            break;
                        }

                        baseMinusT = base - t;
                        if (w > floor(maxInt / baseMinusT)) {
                            error('overflow');
                        }

                        w *= baseMinusT;

                    }

                    out = output.length + 1;
                    bias = adapt(i - oldi, out, oldi == 0);

                    // `i` was supposed to wrap around from `out` to `0`,
                    // incrementing `n` each time, so we'll fix that now:
                    if (floor(i / out) > maxInt - n) {
                        error('overflow');
                    }

                    n += floor(i / out);
                    i %= out;

                    // Insert `n` at position `i` of the output
                    output.splice(i++, 0, n);

                }

                return ucs2encode(output);
            }

            /**
             * Converts a string of Unicode symbols to a Punycode string of ASCII-only
             * symbols.
             * @memberOf punycode
             * @param {String} input The string of Unicode symbols.
             * @returns {String} The resulting Punycode string of ASCII-only symbols.
             */
            function encode(input) {
                var n,
                    delta,
                    handledCPCount,
                    basicLength,
                    bias,
                    j,
                    m,
                    q,
                    k,
                    t,
                    currentValue,
                    output = [],
                    /** `inputLength` will hold the number of code points in `input`. */
                    inputLength,
                    /** Cached calculation results */
                    handledCPCountPlusOne,
                    baseMinusT,
                    qMinusT;

                // Convert the input in UCS-2 to Unicode
                input = ucs2decode(input);

                // Cache the length
                inputLength = input.length;

                // Initialize the state
                n = initialN;
                delta = 0;
                bias = initialBias;

                // Handle the basic code points
                for (j = 0; j < inputLength; ++j) {
                    currentValue = input[j];
                    if (currentValue < 0x80) {
                        output.push(stringFromCharCode(currentValue));
                    }
                }

                handledCPCount = basicLength = output.length;

                // `handledCPCount` is the number of code points that have been handled;
                // `basicLength` is the number of basic code points.

                // Finish the basic string - if it is not empty - with a delimiter
                if (basicLength) {
                    output.push(delimiter);
                }

                // Main encoding loop:
                while (handledCPCount < inputLength) {

                    // All non-basic code points < n have been handled already. Find the next
                    // larger one:
                    for (m = maxInt, j = 0; j < inputLength; ++j) {
                        currentValue = input[j];
                        if (currentValue >= n && currentValue < m) {
                            m = currentValue;
                        }
                    }

                    // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
                    // but guard against overflow
                    handledCPCountPlusOne = handledCPCount + 1;
                    if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
                        error('overflow');
                    }

                    delta += (m - n) * handledCPCountPlusOne;
                    n = m;

                    for (j = 0; j < inputLength; ++j) {
                        currentValue = input[j];

                        if (currentValue < n && ++delta > maxInt) {
                            error('overflow');
                        }

                        if (currentValue == n) {
                            // Represent delta as a generalized variable-length integer
                            for (q = delta, k = base; /* no condition */; k += base) {
                                t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
                                if (q < t) {
                                    break;
                                }
                                qMinusT = q - t;
                                baseMinusT = base - t;
                                output.push(
                                    stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
                                );
                                q = floor(qMinusT / baseMinusT);
                            }

                            output.push(stringFromCharCode(digitToBasic(q, 0)));
                            bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
                            delta = 0;
                            ++handledCPCount;
                        }
                    }

                    ++delta;
                    ++n;

                }
                return output.join('');
            }

            /**
             * Converts a Punycode string representing a domain name to Unicode. Only the
             * Punycoded parts of the domain name will be converted, i.e. it doesn't
             * matter if you call it on a string that has already been converted to
             * Unicode.
             * @memberOf punycode
             * @param {String} domain The Punycode domain name to convert to Unicode.
             * @returns {String} The Unicode representation of the given Punycode
             * string.
             */
            function toUnicode(domain) {
                return mapDomain(domain, function(string) {
                    return regexPunycode.test(string)
                        ? decode(string.slice(4).toLowerCase())
                        : string;
                });
            }

            /**
             * Converts a Unicode string representing a domain name to Punycode. Only the
             * non-ASCII parts of the domain name will be converted, i.e. it doesn't
             * matter if you call it with a domain that's already in ASCII.
             * @memberOf punycode
             * @param {String} domain The domain name to convert, as a Unicode string.
             * @returns {String} The Punycode representation of the given domain name.
             */
            function toASCII(domain) {
                return mapDomain(domain, function(string) {
                    return regexNonASCII.test(string)
                        ? 'xn--' + encode(string)
                        : string;
                });
            }

            /*--------------------------------------------------------------------------*/

            /** Define the public API */
            punycode = {
                /**
                 * A string representing the current Punycode.js version number.
                 * @memberOf punycode
                 * @type String
                 */
                'version': '1.2.4',
                /**
                 * An object of methods to convert from JavaScript's internal character
                 * representation (UCS-2) to Unicode code points, and back.
                 * @see <http://mathiasbynens.be/notes/javascript-encoding>
                 * @memberOf punycode
                 * @type Object
                 */
                'ucs2': {
                    'decode': ucs2decode,
                    'encode': ucs2encode
                },
                'decode': decode,
                'encode': encode,
                'toASCII': toASCII,
                'toUnicode': toUnicode
            };

            /** Expose `punycode` */
            // Some AMD build optimizers, like r.js, check for specific condition patterns
            // like the following:
            if (
                typeof define == 'function' &&
                typeof define.amd == 'object' &&
                define.amd
                ) {
                define('punycode', function() {
                    return punycode;
                });
            } else if (freeExports && !freeExports.nodeType) {
                if (freeModule) { // in Node.js or RingoJS v0.8.0+
                    freeModule.exports = punycode;
                } else { // in Narwhal or RingoJS v0.7.0-
                    for (key in punycode) {
                        punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
                    }
                }
            } else { // in Rhino or a web browser
                root.punycode = punycode;
            }

        }(this));

    }).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],19:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

    'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
    function hasOwnProperty(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
    }

    module.exports = function(qs, sep, eq, options) {
        sep = sep || '&';
        eq = eq || '=';
        var obj = {};

        if (typeof qs !== 'string' || qs.length === 0) {
            return obj;
        }

        var regexp = /\+/g;
        qs = qs.split(sep);

        var maxKeys = 1000;
        if (options && typeof options.maxKeys === 'number') {
            maxKeys = options.maxKeys;
        }

        var len = qs.length;
        // maxKeys <= 0 means that we should not limit keys count
        if (maxKeys > 0 && len > maxKeys) {
            len = maxKeys;
        }

        for (var i = 0; i < len; ++i) {
            var x = qs[i].replace(regexp, '%20'),
                idx = x.indexOf(eq),
                kstr, vstr, k, v;

            if (idx >= 0) {
                kstr = x.substr(0, idx);
                vstr = x.substr(idx + 1);
            } else {
                kstr = x;
                vstr = '';
            }

            k = decodeURIComponent(kstr);
            v = decodeURIComponent(vstr);

            if (!hasOwnProperty(obj, k)) {
                obj[k] = v;
            } else if (isArray(obj[k])) {
                obj[k].push(v);
            } else {
                obj[k] = [obj[k], v];
            }
        }

        return obj;
    };

    var isArray = Array.isArray || function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]';
    };

},{}],20:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

    'use strict';

    var stringifyPrimitive = function(v) {
        switch (typeof v) {
            case 'string':
                return v;

            case 'boolean':
                return v ? 'true' : 'false';

            case 'number':
                return isFinite(v) ? v : '';

            default:
                return '';
        }
    };

    module.exports = function(obj, sep, eq, name) {
        sep = sep || '&';
        eq = eq || '=';
        if (obj === null) {
            obj = undefined;
        }

        if (typeof obj === 'object') {
            return map(objectKeys(obj), function(k) {
                var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
                if (isArray(obj[k])) {
                    return map(obj[k], function(v) {
                        return ks + encodeURIComponent(stringifyPrimitive(v));
                    }).join(sep);
                } else {
                    return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
                }
            }).join(sep);

        }

        if (!name) return '';
        return encodeURIComponent(stringifyPrimitive(name)) + eq +
            encodeURIComponent(stringifyPrimitive(obj));
    };

    var isArray = Array.isArray || function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]';
    };

    function map (xs, f) {
        if (xs.map) return xs.map(f);
        var res = [];
        for (var i = 0; i < xs.length; i++) {
            res.push(f(xs[i], i));
        }
        return res;
    }

    var objectKeys = Object.keys || function (obj) {
        var res = [];
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
        }
        return res;
    };

},{}],21:[function(require,module,exports){
    'use strict';

    exports.decode = exports.parse = require('./decode');
    exports.encode = exports.stringify = require('./encode');

},{"./decode":19,"./encode":20}],22:[function(require,module,exports){
    module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":23}],23:[function(require,module,exports){
    (function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

        module.exports = Duplex;

        /*<replacement>*/
        var objectKeys = Object.keys || function (obj) {
            var keys = [];
            for (var key in obj) keys.push(key);
            return keys;
        }
        /*</replacement>*/


        /*<replacement>*/
        var util = require('core-util-is');
        util.inherits = require('inherits');
        /*</replacement>*/

        var Readable = require('./_stream_readable');
        var Writable = require('./_stream_writable');

        util.inherits(Duplex, Readable);

        forEach(objectKeys(Writable.prototype), function(method) {
            if (!Duplex.prototype[method])
                Duplex.prototype[method] = Writable.prototype[method];
        });

        function Duplex(options) {
            if (!(this instanceof Duplex))
                return new Duplex(options);

            Readable.call(this, options);
            Writable.call(this, options);

            if (options && options.readable === false)
                this.readable = false;

            if (options && options.writable === false)
                this.writable = false;

            this.allowHalfOpen = true;
            if (options && options.allowHalfOpen === false)
                this.allowHalfOpen = false;

            this.once('end', onend);
        }

// the no-half-open enforcer
        function onend() {
            // if we allow half-open state, or if the writable side ended,
            // then we're ok.
            if (this.allowHalfOpen || this._writableState.ended)
                return;

            // no more data can be written.
            // But allow more writes to happen in this tick.
            process.nextTick(this.end.bind(this));
        }

        function forEach (xs, f) {
            for (var i = 0, l = xs.length; i < l; i++) {
                f(xs[i], i);
            }
        }

    }).call(this,require("kuNg5g"))
},{"./_stream_readable":25,"./_stream_writable":27,"core-util-is":28,"inherits":16,"kuNg5g":17}],24:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

    module.exports = PassThrough;

    var Transform = require('./_stream_transform');

    /*<replacement>*/
    var util = require('core-util-is');
    util.inherits = require('inherits');
    /*</replacement>*/

    util.inherits(PassThrough, Transform);

    function PassThrough(options) {
        if (!(this instanceof PassThrough))
            return new PassThrough(options);

        Transform.call(this, options);
    }

    PassThrough.prototype._transform = function(chunk, encoding, cb) {
        cb(null, chunk);
    };

},{"./_stream_transform":26,"core-util-is":28,"inherits":16}],25:[function(require,module,exports){
    (function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

        module.exports = Readable;

        /*<replacement>*/
        var isArray = require('isarray');
        /*</replacement>*/


        /*<replacement>*/
        var Buffer = require('buffer').Buffer;
        /*</replacement>*/

        Readable.ReadableState = ReadableState;

        var EE = require('events').EventEmitter;

        /*<replacement>*/
        if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
            return emitter.listeners(type).length;
        };
        /*</replacement>*/

        var Stream = require('stream');

        /*<replacement>*/
        var util = require('core-util-is');
        util.inherits = require('inherits');
        /*</replacement>*/

        var StringDecoder;

        util.inherits(Readable, Stream);

        function ReadableState(options, stream) {
            options = options || {};

            // the point at which it stops calling _read() to fill the buffer
            // Note: 0 is a valid value, means "don't call _read preemptively ever"
            var hwm = options.highWaterMark;
            this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

            // cast to ints.
            this.highWaterMark = ~~this.highWaterMark;

            this.buffer = [];
            this.length = 0;
            this.pipes = null;
            this.pipesCount = 0;
            this.flowing = false;
            this.ended = false;
            this.endEmitted = false;
            this.reading = false;

            // In streams that never have any data, and do push(null) right away,
            // the consumer can miss the 'end' event if they do some I/O before
            // consuming the stream.  So, we don't emit('end') until some reading
            // happens.
            this.calledRead = false;

            // a flag to be able to tell if the onwrite cb is called immediately,
            // or on a later tick.  We set this to true at first, becuase any
            // actions that shouldn't happen until "later" should generally also
            // not happen before the first write call.
            this.sync = true;

            // whenever we return null, then we set a flag to say
            // that we're awaiting a 'readable' event emission.
            this.needReadable = false;
            this.emittedReadable = false;
            this.readableListening = false;


            // object stream flag. Used to make read(n) ignore n and to
            // make all the buffer merging and length checks go away
            this.objectMode = !!options.objectMode;

            // Crypto is kind of old and crusty.  Historically, its default string
            // encoding is 'binary' so we have to make this configurable.
            // Everything else in the universe uses 'utf8', though.
            this.defaultEncoding = options.defaultEncoding || 'utf8';

            // when piping, we only care about 'readable' events that happen
            // after read()ing all the bytes and not getting any pushback.
            this.ranOut = false;

            // the number of writers that are awaiting a drain event in .pipe()s
            this.awaitDrain = 0;

            // if true, a maybeReadMore has been scheduled
            this.readingMore = false;

            this.decoder = null;
            this.encoding = null;
            if (options.encoding) {
                if (!StringDecoder)
                    StringDecoder = require('string_decoder/').StringDecoder;
                this.decoder = new StringDecoder(options.encoding);
                this.encoding = options.encoding;
            }
        }

        function Readable(options) {
            if (!(this instanceof Readable))
                return new Readable(options);

            this._readableState = new ReadableState(options, this);

            // legacy
            this.readable = true;

            Stream.call(this);
        }

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
        Readable.prototype.push = function(chunk, encoding) {
            var state = this._readableState;

            if (typeof chunk === 'string' && !state.objectMode) {
                encoding = encoding || state.defaultEncoding;
                if (encoding !== state.encoding) {
                    chunk = new Buffer(chunk, encoding);
                    encoding = '';
                }
            }

            return readableAddChunk(this, state, chunk, encoding, false);
        };

// Unshift should *always* be something directly out of read()
        Readable.prototype.unshift = function(chunk) {
            var state = this._readableState;
            return readableAddChunk(this, state, chunk, '', true);
        };

        function readableAddChunk(stream, state, chunk, encoding, addToFront) {
            var er = chunkInvalid(state, chunk);
            if (er) {
                stream.emit('error', er);
            } else if (chunk === null || chunk === undefined) {
                state.reading = false;
                if (!state.ended)
                    onEofChunk(stream, state);
            } else if (state.objectMode || chunk && chunk.length > 0) {
                if (state.ended && !addToFront) {
                    var e = new Error('stream.push() after EOF');
                    stream.emit('error', e);
                } else if (state.endEmitted && addToFront) {
                    var e = new Error('stream.unshift() after end event');
                    stream.emit('error', e);
                } else {
                    if (state.decoder && !addToFront && !encoding)
                        chunk = state.decoder.write(chunk);

                    // update the buffer info.
                    state.length += state.objectMode ? 1 : chunk.length;
                    if (addToFront) {
                        state.buffer.unshift(chunk);
                    } else {
                        state.reading = false;
                        state.buffer.push(chunk);
                    }

                    if (state.needReadable)
                        emitReadable(stream);

                    maybeReadMore(stream, state);
                }
            } else if (!addToFront) {
                state.reading = false;
            }

            return needMoreData(state);
        }



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
        function needMoreData(state) {
            return !state.ended &&
                (state.needReadable ||
                    state.length < state.highWaterMark ||
                    state.length === 0);
        }

// backwards compatibility.
        Readable.prototype.setEncoding = function(enc) {
            if (!StringDecoder)
                StringDecoder = require('string_decoder/').StringDecoder;
            this._readableState.decoder = new StringDecoder(enc);
            this._readableState.encoding = enc;
        };

// Don't raise the hwm > 128MB
        var MAX_HWM = 0x800000;
        function roundUpToNextPowerOf2(n) {
            if (n >= MAX_HWM) {
                n = MAX_HWM;
            } else {
                // Get the next highest power of 2
                n--;
                for (var p = 1; p < 32; p <<= 1) n |= n >> p;
                n++;
            }
            return n;
        }

        function howMuchToRead(n, state) {
            if (state.length === 0 && state.ended)
                return 0;

            if (state.objectMode)
                return n === 0 ? 0 : 1;

            if (isNaN(n) || n === null) {
                // only flow one buffer at a time
                if (state.flowing && state.buffer.length)
                    return state.buffer[0].length;
                else
                    return state.length;
            }

            if (n <= 0)
                return 0;

            // If we're asking for more than the target buffer level,
            // then raise the water mark.  Bump up to the next highest
            // power of 2, to prevent increasing it excessively in tiny
            // amounts.
            if (n > state.highWaterMark)
                state.highWaterMark = roundUpToNextPowerOf2(n);

            // don't have that much.  return null, unless we've ended.
            if (n > state.length) {
                if (!state.ended) {
                    state.needReadable = true;
                    return 0;
                } else
                    return state.length;
            }

            return n;
        }

// you can override either this method, or the async _read(n) below.
        Readable.prototype.read = function(n) {
            var state = this._readableState;
            state.calledRead = true;
            var nOrig = n;

            if (typeof n !== 'number' || n > 0)
                state.emittedReadable = false;

            // if we're doing read(0) to trigger a readable event, but we
            // already have a bunch of data in the buffer, then just trigger
            // the 'readable' event and move on.
            if (n === 0 &&
                state.needReadable &&
                (state.length >= state.highWaterMark || state.ended)) {
                emitReadable(this);
                return null;
            }

            n = howMuchToRead(n, state);

            // if we've ended, and we're now clear, then finish it up.
            if (n === 0 && state.ended) {
                if (state.length === 0)
                    endReadable(this);
                return null;
            }

            // All the actual chunk generation logic needs to be
            // *below* the call to _read.  The reason is that in certain
            // synthetic stream cases, such as passthrough streams, _read
            // may be a completely synchronous operation which may change
            // the state of the read buffer, providing enough data when
            // before there was *not* enough.
            //
            // So, the steps are:
            // 1. Figure out what the state of things will be after we do
            // a read from the buffer.
            //
            // 2. If that resulting state will trigger a _read, then call _read.
            // Note that this may be asynchronous, or synchronous.  Yes, it is
            // deeply ugly to write APIs this way, but that still doesn't mean
            // that the Readable class should behave improperly, as streams are
            // designed to be sync/async agnostic.
            // Take note if the _read call is sync or async (ie, if the read call
            // has returned yet), so that we know whether or not it's safe to emit
            // 'readable' etc.
            //
            // 3. Actually pull the requested chunks out of the buffer and return.

            // if we need a readable event, then we need to do some reading.
            var doRead = state.needReadable;

            // if we currently have less than the highWaterMark, then also read some
            if (state.length - n <= state.highWaterMark)
                doRead = true;

            // however, if we've ended, then there's no point, and if we're already
            // reading, then it's unnecessary.
            if (state.ended || state.reading)
                doRead = false;

            if (doRead) {
                state.reading = true;
                state.sync = true;
                // if the length is currently zero, then we *need* a readable event.
                if (state.length === 0)
                    state.needReadable = true;
                // call internal read method
                this._read(state.highWaterMark);
                state.sync = false;
            }

            // If _read called its callback synchronously, then `reading`
            // will be false, and we need to re-evaluate how much data we
            // can return to the user.
            if (doRead && !state.reading)
                n = howMuchToRead(nOrig, state);

            var ret;
            if (n > 0)
                ret = fromList(n, state);
            else
                ret = null;

            if (ret === null) {
                state.needReadable = true;
                n = 0;
            }

            state.length -= n;

            // If we have nothing in the buffer, then we want to know
            // as soon as we *do* get something into the buffer.
            if (state.length === 0 && !state.ended)
                state.needReadable = true;

            // If we happened to read() exactly the remaining amount in the
            // buffer, and the EOF has been seen at this point, then make sure
            // that we emit 'end' on the very next tick.
            if (state.ended && !state.endEmitted && state.length === 0)
                endReadable(this);

            return ret;
        };

        function chunkInvalid(state, chunk) {
            var er = null;
            if (!Buffer.isBuffer(chunk) &&
                'string' !== typeof chunk &&
                chunk !== null &&
                chunk !== undefined &&
                !state.objectMode &&
                !er) {
                er = new TypeError('Invalid non-string/buffer chunk');
            }
            return er;
        }


        function onEofChunk(stream, state) {
            if (state.decoder && !state.ended) {
                var chunk = state.decoder.end();
                if (chunk && chunk.length) {
                    state.buffer.push(chunk);
                    state.length += state.objectMode ? 1 : chunk.length;
                }
            }
            state.ended = true;

            // if we've ended and we have some data left, then emit
            // 'readable' now to make sure it gets picked up.
            if (state.length > 0)
                emitReadable(stream);
            else
                endReadable(stream);
        }

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
        function emitReadable(stream) {
            var state = stream._readableState;
            state.needReadable = false;
            if (state.emittedReadable)
                return;

            state.emittedReadable = true;
            if (state.sync)
                process.nextTick(function() {
                    emitReadable_(stream);
                });
            else
                emitReadable_(stream);
        }

        function emitReadable_(stream) {
            stream.emit('readable');
        }


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
        function maybeReadMore(stream, state) {
            if (!state.readingMore) {
                state.readingMore = true;
                process.nextTick(function() {
                    maybeReadMore_(stream, state);
                });
            }
        }

        function maybeReadMore_(stream, state) {
            var len = state.length;
            while (!state.reading && !state.flowing && !state.ended &&
                state.length < state.highWaterMark) {
                stream.read(0);
                if (len === state.length)
                // didn't get any data, stop spinning.
                    break;
                else
                    len = state.length;
            }
            state.readingMore = false;
        }

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
        Readable.prototype._read = function(n) {
            this.emit('error', new Error('not implemented'));
        };

        Readable.prototype.pipe = function(dest, pipeOpts) {
            var src = this;
            var state = this._readableState;

            switch (state.pipesCount) {
                case 0:
                    state.pipes = dest;
                    break;
                case 1:
                    state.pipes = [state.pipes, dest];
                    break;
                default:
                    state.pipes.push(dest);
                    break;
            }
            state.pipesCount += 1;

            var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
                dest !== process.stdout &&
                dest !== process.stderr;

            var endFn = doEnd ? onend : cleanup;
            if (state.endEmitted)
                process.nextTick(endFn);
            else
                src.once('end', endFn);

            dest.on('unpipe', onunpipe);
            function onunpipe(readable) {
                if (readable !== src) return;
                cleanup();
            }

            function onend() {
                dest.end();
            }

            // when the dest drains, it reduces the awaitDrain counter
            // on the source.  This would be more elegant with a .once()
            // handler in flow(), but adding and removing repeatedly is
            // too slow.
            var ondrain = pipeOnDrain(src);
            dest.on('drain', ondrain);

            function cleanup() {
                // cleanup event handlers once the pipe is broken
                dest.removeListener('close', onclose);
                dest.removeListener('finish', onfinish);
                dest.removeListener('drain', ondrain);
                dest.removeListener('error', onerror);
                dest.removeListener('unpipe', onunpipe);
                src.removeListener('end', onend);
                src.removeListener('end', cleanup);

                // if the reader is waiting for a drain event from this
                // specific writer, then it would cause it to never start
                // flowing again.
                // So, if this is awaiting a drain, then we just call it now.
                // If we don't know, then assume that we are waiting for one.
                if (!dest._writableState || dest._writableState.needDrain)
                    ondrain();
            }

            // if the dest has an error, then stop piping into it.
            // however, don't suppress the throwing behavior for this.
            function onerror(er) {
                unpipe();
                dest.removeListener('error', onerror);
                if (EE.listenerCount(dest, 'error') === 0)
                    dest.emit('error', er);
            }
            // This is a brutally ugly hack to make sure that our error handler
            // is attached before any userland ones.  NEVER DO THIS.
            if (!dest._events || !dest._events.error)
                dest.on('error', onerror);
            else if (isArray(dest._events.error))
                dest._events.error.unshift(onerror);
            else
                dest._events.error = [onerror, dest._events.error];



            // Both close and finish should trigger unpipe, but only once.
            function onclose() {
                dest.removeListener('finish', onfinish);
                unpipe();
            }
            dest.once('close', onclose);
            function onfinish() {
                dest.removeListener('close', onclose);
                unpipe();
            }
            dest.once('finish', onfinish);

            function unpipe() {
                src.unpipe(dest);
            }

            // tell the dest that it's being piped to
            dest.emit('pipe', src);

            // start the flow if it hasn't been started already.
            if (!state.flowing) {
                // the handler that waits for readable events after all
                // the data gets sucked out in flow.
                // This would be easier to follow with a .once() handler
                // in flow(), but that is too slow.
                this.on('readable', pipeOnReadable);

                state.flowing = true;
                process.nextTick(function() {
                    flow(src);
                });
            }

            return dest;
        };

        function pipeOnDrain(src) {
            return function() {
                var dest = this;
                var state = src._readableState;
                state.awaitDrain--;
                if (state.awaitDrain === 0)
                    flow(src);
            };
        }

        function flow(src) {
            var state = src._readableState;
            var chunk;
            state.awaitDrain = 0;

            function write(dest, i, list) {
                var written = dest.write(chunk);
                if (false === written) {
                    state.awaitDrain++;
                }
            }

            while (state.pipesCount && null !== (chunk = src.read())) {

                if (state.pipesCount === 1)
                    write(state.pipes, 0, null);
                else
                    forEach(state.pipes, write);

                src.emit('data', chunk);

                // if anyone needs a drain, then we have to wait for that.
                if (state.awaitDrain > 0)
                    return;
            }

            // if every destination was unpiped, either before entering this
            // function, or in the while loop, then stop flowing.
            //
            // NB: This is a pretty rare edge case.
            if (state.pipesCount === 0) {
                state.flowing = false;

                // if there were data event listeners added, then switch to old mode.
                if (EE.listenerCount(src, 'data') > 0)
                    emitDataEvents(src);
                return;
            }

            // at this point, no one needed a drain, so we just ran out of data
            // on the next readable event, start it over again.
            state.ranOut = true;
        }

        function pipeOnReadable() {
            if (this._readableState.ranOut) {
                this._readableState.ranOut = false;
                flow(this);
            }
        }


        Readable.prototype.unpipe = function(dest) {
            var state = this._readableState;

            // if we're not piping anywhere, then do nothing.
            if (state.pipesCount === 0)
                return this;

            // just one destination.  most common case.
            if (state.pipesCount === 1) {
                // passed in one, but it's not the right one.
                if (dest && dest !== state.pipes)
                    return this;

                if (!dest)
                    dest = state.pipes;

                // got a match.
                state.pipes = null;
                state.pipesCount = 0;
                this.removeListener('readable', pipeOnReadable);
                state.flowing = false;
                if (dest)
                    dest.emit('unpipe', this);
                return this;
            }

            // slow case. multiple pipe destinations.

            if (!dest) {
                // remove all.
                var dests = state.pipes;
                var len = state.pipesCount;
                state.pipes = null;
                state.pipesCount = 0;
                this.removeListener('readable', pipeOnReadable);
                state.flowing = false;

                for (var i = 0; i < len; i++)
                    dests[i].emit('unpipe', this);
                return this;
            }

            // try to find the right one.
            var i = indexOf(state.pipes, dest);
            if (i === -1)
                return this;

            state.pipes.splice(i, 1);
            state.pipesCount -= 1;
            if (state.pipesCount === 1)
                state.pipes = state.pipes[0];

            dest.emit('unpipe', this);

            return this;
        };

// set up data events if they are asked for
// Ensure readable listeners eventually get something
        Readable.prototype.on = function(ev, fn) {
            var res = Stream.prototype.on.call(this, ev, fn);

            if (ev === 'data' && !this._readableState.flowing)
                emitDataEvents(this);

            if (ev === 'readable' && this.readable) {
                var state = this._readableState;
                if (!state.readableListening) {
                    state.readableListening = true;
                    state.emittedReadable = false;
                    state.needReadable = true;
                    if (!state.reading) {
                        this.read(0);
                    } else if (state.length) {
                        emitReadable(this, state);
                    }
                }
            }

            return res;
        };
        Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
        Readable.prototype.resume = function() {
            emitDataEvents(this);
            this.read(0);
            this.emit('resume');
        };

        Readable.prototype.pause = function() {
            emitDataEvents(this, true);
            this.emit('pause');
        };

        function emitDataEvents(stream, startPaused) {
            var state = stream._readableState;

            if (state.flowing) {
                // https://github.com/isaacs/readable-stream/issues/16
                throw new Error('Cannot switch to old mode now.');
            }

            var paused = startPaused || false;
            var readable = false;

            // convert to an old-style stream.
            stream.readable = true;
            stream.pipe = Stream.prototype.pipe;
            stream.on = stream.addListener = Stream.prototype.on;

            stream.on('readable', function() {
                readable = true;

                var c;
                while (!paused && (null !== (c = stream.read())))
                    stream.emit('data', c);

                if (c === null) {
                    readable = false;
                    stream._readableState.needReadable = true;
                }
            });

            stream.pause = function() {
                paused = true;
                this.emit('pause');
            };

            stream.resume = function() {
                paused = false;
                if (readable)
                    process.nextTick(function() {
                        stream.emit('readable');
                    });
                else
                    this.read(0);
                this.emit('resume');
            };

            // now make it start, just in case it hadn't already.
            stream.emit('readable');
        }

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
        Readable.prototype.wrap = function(stream) {
            var state = this._readableState;
            var paused = false;

            var self = this;
            stream.on('end', function() {
                if (state.decoder && !state.ended) {
                    var chunk = state.decoder.end();
                    if (chunk && chunk.length)
                        self.push(chunk);
                }

                self.push(null);
            });

            stream.on('data', function(chunk) {
                if (state.decoder)
                    chunk = state.decoder.write(chunk);
                if (!chunk || !state.objectMode && !chunk.length)
                    return;

                var ret = self.push(chunk);
                if (!ret) {
                    paused = true;
                    stream.pause();
                }
            });

            // proxy all the other methods.
            // important when wrapping filters and duplexes.
            for (var i in stream) {
                if (typeof stream[i] === 'function' &&
                    typeof this[i] === 'undefined') {
                    this[i] = function(method) { return function() {
                        return stream[method].apply(stream, arguments);
                    }}(i);
                }
            }

            // proxy certain important events.
            var events = ['error', 'close', 'destroy', 'pause', 'resume'];
            forEach(events, function(ev) {
                stream.on(ev, self.emit.bind(self, ev));
            });

            // when we try to consume some more bytes, simply unpause the
            // underlying stream.
            self._read = function(n) {
                if (paused) {
                    paused = false;
                    stream.resume();
                }
            };

            return self;
        };



// exposed for testing purposes only.
        Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
        function fromList(n, state) {
            var list = state.buffer;
            var length = state.length;
            var stringMode = !!state.decoder;
            var objectMode = !!state.objectMode;
            var ret;

            // nothing in the list, definitely empty.
            if (list.length === 0)
                return null;

            if (length === 0)
                ret = null;
            else if (objectMode)
                ret = list.shift();
            else if (!n || n >= length) {
                // read it all, truncate the array.
                if (stringMode)
                    ret = list.join('');
                else
                    ret = Buffer.concat(list, length);
                list.length = 0;
            } else {
                // read just some of it.
                if (n < list[0].length) {
                    // just take a part of the first list item.
                    // slice is the same for buffers and strings.
                    var buf = list[0];
                    ret = buf.slice(0, n);
                    list[0] = buf.slice(n);
                } else if (n === list[0].length) {
                    // first list is a perfect match
                    ret = list.shift();
                } else {
                    // complex case.
                    // we have enough to cover it, but it spans past the first buffer.
                    if (stringMode)
                        ret = '';
                    else
                        ret = new Buffer(n);

                    var c = 0;
                    for (var i = 0, l = list.length; i < l && c < n; i++) {
                        var buf = list[0];
                        var cpy = Math.min(n - c, buf.length);

                        if (stringMode)
                            ret += buf.slice(0, cpy);
                        else
                            buf.copy(ret, c, 0, cpy);

                        if (cpy < buf.length)
                            list[0] = buf.slice(cpy);
                        else
                            list.shift();

                        c += cpy;
                    }
                }
            }

            return ret;
        }

        function endReadable(stream) {
            var state = stream._readableState;

            // If we get here before consuming all the bytes, then that is a
            // bug in node.  Should never happen.
            if (state.length > 0)
                throw new Error('endReadable called on non-empty stream');

            if (!state.endEmitted && state.calledRead) {
                state.ended = true;
                process.nextTick(function() {
                    // Check that we didn't get one last unshift.
                    if (!state.endEmitted && state.length === 0) {
                        state.endEmitted = true;
                        stream.readable = false;
                        stream.emit('end');
                    }
                });
            }
        }

        function forEach (xs, f) {
            for (var i = 0, l = xs.length; i < l; i++) {
                f(xs[i], i);
            }
        }

        function indexOf (xs, x) {
            for (var i = 0, l = xs.length; i < l; i++) {
                if (xs[i] === x) return i;
            }
            return -1;
        }

    }).call(this,require("kuNg5g"))
},{"buffer":2,"core-util-is":28,"events":11,"inherits":16,"isarray":29,"kuNg5g":17,"stream":35,"string_decoder/":30}],26:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

    module.exports = Transform;

    var Duplex = require('./_stream_duplex');

    /*<replacement>*/
    var util = require('core-util-is');
    util.inherits = require('inherits');
    /*</replacement>*/

    util.inherits(Transform, Duplex);


    function TransformState(options, stream) {
        this.afterTransform = function(er, data) {
            return afterTransform(stream, er, data);
        };

        this.needTransform = false;
        this.transforming = false;
        this.writecb = null;
        this.writechunk = null;
    }

    function afterTransform(stream, er, data) {
        var ts = stream._transformState;
        ts.transforming = false;

        var cb = ts.writecb;

        if (!cb)
            return stream.emit('error', new Error('no writecb in Transform class'));

        ts.writechunk = null;
        ts.writecb = null;

        if (data !== null && data !== undefined)
            stream.push(data);

        if (cb)
            cb(er);

        var rs = stream._readableState;
        rs.reading = false;
        if (rs.needReadable || rs.length < rs.highWaterMark) {
            stream._read(rs.highWaterMark);
        }
    }


    function Transform(options) {
        if (!(this instanceof Transform))
            return new Transform(options);

        Duplex.call(this, options);

        var ts = this._transformState = new TransformState(options, this);

        // when the writable side finishes, then flush out anything remaining.
        var stream = this;

        // start out asking for a readable event once data is transformed.
        this._readableState.needReadable = true;

        // we have implemented the _read method, and done the other things
        // that Readable wants before the first _read call, so unset the
        // sync guard flag.
        this._readableState.sync = false;

        this.once('finish', function() {
            if ('function' === typeof this._flush)
                this._flush(function(er) {
                    done(stream, er);
                });
            else
                done(stream);
        });
    }

    Transform.prototype.push = function(chunk, encoding) {
        this._transformState.needTransform = false;
        return Duplex.prototype.push.call(this, chunk, encoding);
    };

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
    Transform.prototype._transform = function(chunk, encoding, cb) {
        throw new Error('not implemented');
    };

    Transform.prototype._write = function(chunk, encoding, cb) {
        var ts = this._transformState;
        ts.writecb = cb;
        ts.writechunk = chunk;
        ts.writeencoding = encoding;
        if (!ts.transforming) {
            var rs = this._readableState;
            if (ts.needTransform ||
                rs.needReadable ||
                rs.length < rs.highWaterMark)
                this._read(rs.highWaterMark);
        }
    };

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
    Transform.prototype._read = function(n) {
        var ts = this._transformState;

        if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
            ts.transforming = true;
            this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
        } else {
            // mark that we need a transform, so that any data that comes in
            // will get processed, now that we've asked for it.
            ts.needTransform = true;
        }
    };


    function done(stream, er) {
        if (er)
            return stream.emit('error', er);

        // if there's nothing in the write buffer, then that means
        // that nothing more will ever be provided
        var ws = stream._writableState;
        var rs = stream._readableState;
        var ts = stream._transformState;

        if (ws.length)
            throw new Error('calling transform done when ws.length != 0');

        if (ts.transforming)
            throw new Error('calling transform done when still transforming');

        return stream.push(null);
    }

},{"./_stream_duplex":23,"core-util-is":28,"inherits":16}],27:[function(require,module,exports){
    (function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

        module.exports = Writable;

        /*<replacement>*/
        var Buffer = require('buffer').Buffer;
        /*</replacement>*/

        Writable.WritableState = WritableState;


        /*<replacement>*/
        var util = require('core-util-is');
        util.inherits = require('inherits');
        /*</replacement>*/


        var Stream = require('stream');

        util.inherits(Writable, Stream);

        function WriteReq(chunk, encoding, cb) {
            this.chunk = chunk;
            this.encoding = encoding;
            this.callback = cb;
        }

        function WritableState(options, stream) {
            options = options || {};

            // the point at which write() starts returning false
            // Note: 0 is a valid value, means that we always return false if
            // the entire buffer is not flushed immediately on write()
            var hwm = options.highWaterMark;
            this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

            // object stream flag to indicate whether or not this stream
            // contains buffers or objects.
            this.objectMode = !!options.objectMode;

            // cast to ints.
            this.highWaterMark = ~~this.highWaterMark;

            this.needDrain = false;
            // at the start of calling end()
            this.ending = false;
            // when end() has been called, and returned
            this.ended = false;
            // when 'finish' is emitted
            this.finished = false;

            // should we decode strings into buffers before passing to _write?
            // this is here so that some node-core streams can optimize string
            // handling at a lower level.
            var noDecode = options.decodeStrings === false;
            this.decodeStrings = !noDecode;

            // Crypto is kind of old and crusty.  Historically, its default string
            // encoding is 'binary' so we have to make this configurable.
            // Everything else in the universe uses 'utf8', though.
            this.defaultEncoding = options.defaultEncoding || 'utf8';

            // not an actual buffer we keep track of, but a measurement
            // of how much we're waiting to get pushed to some underlying
            // socket or file.
            this.length = 0;

            // a flag to see when we're in the middle of a write.
            this.writing = false;

            // a flag to be able to tell if the onwrite cb is called immediately,
            // or on a later tick.  We set this to true at first, becuase any
            // actions that shouldn't happen until "later" should generally also
            // not happen before the first write call.
            this.sync = true;

            // a flag to know if we're processing previously buffered items, which
            // may call the _write() callback in the same tick, so that we don't
            // end up in an overlapped onwrite situation.
            this.bufferProcessing = false;

            // the callback that's passed to _write(chunk,cb)
            this.onwrite = function(er) {
                onwrite(stream, er);
            };

            // the callback that the user supplies to write(chunk,encoding,cb)
            this.writecb = null;

            // the amount that is being written when _write is called.
            this.writelen = 0;

            this.buffer = [];

            // True if the error was already emitted and should not be thrown again
            this.errorEmitted = false;
        }

        function Writable(options) {
            var Duplex = require('./_stream_duplex');

            // Writable ctor is applied to Duplexes, though they're not
            // instanceof Writable, they're instanceof Readable.
            if (!(this instanceof Writable) && !(this instanceof Duplex))
                return new Writable(options);

            this._writableState = new WritableState(options, this);

            // legacy.
            this.writable = true;

            Stream.call(this);
        }

// Otherwise people can pipe Writable streams, which is just wrong.
        Writable.prototype.pipe = function() {
            this.emit('error', new Error('Cannot pipe. Not readable.'));
        };


        function writeAfterEnd(stream, state, cb) {
            var er = new Error('write after end');
            // TODO: defer error events consistently everywhere, not just the cb
            stream.emit('error', er);
            process.nextTick(function() {
                cb(er);
            });
        }

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
        function validChunk(stream, state, chunk, cb) {
            var valid = true;
            if (!Buffer.isBuffer(chunk) &&
                'string' !== typeof chunk &&
                chunk !== null &&
                chunk !== undefined &&
                !state.objectMode) {
                var er = new TypeError('Invalid non-string/buffer chunk');
                stream.emit('error', er);
                process.nextTick(function() {
                    cb(er);
                });
                valid = false;
            }
            return valid;
        }

        Writable.prototype.write = function(chunk, encoding, cb) {
            var state = this._writableState;
            var ret = false;

            if (typeof encoding === 'function') {
                cb = encoding;
                encoding = null;
            }

            if (Buffer.isBuffer(chunk))
                encoding = 'buffer';
            else if (!encoding)
                encoding = state.defaultEncoding;

            if (typeof cb !== 'function')
                cb = function() {};

            if (state.ended)
                writeAfterEnd(this, state, cb);
            else if (validChunk(this, state, chunk, cb))
                ret = writeOrBuffer(this, state, chunk, encoding, cb);

            return ret;
        };

        function decodeChunk(state, chunk, encoding) {
            if (!state.objectMode &&
                state.decodeStrings !== false &&
                typeof chunk === 'string') {
                chunk = new Buffer(chunk, encoding);
            }
            return chunk;
        }

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
        function writeOrBuffer(stream, state, chunk, encoding, cb) {
            chunk = decodeChunk(state, chunk, encoding);
            if (Buffer.isBuffer(chunk))
                encoding = 'buffer';
            var len = state.objectMode ? 1 : chunk.length;

            state.length += len;

            var ret = state.length < state.highWaterMark;
            // we must ensure that previous needDrain will not be reset to false.
            if (!ret)
                state.needDrain = true;

            if (state.writing)
                state.buffer.push(new WriteReq(chunk, encoding, cb));
            else
                doWrite(stream, state, len, chunk, encoding, cb);

            return ret;
        }

        function doWrite(stream, state, len, chunk, encoding, cb) {
            state.writelen = len;
            state.writecb = cb;
            state.writing = true;
            state.sync = true;
            stream._write(chunk, encoding, state.onwrite);
            state.sync = false;
        }

        function onwriteError(stream, state, sync, er, cb) {
            if (sync)
                process.nextTick(function() {
                    cb(er);
                });
            else
                cb(er);

            stream._writableState.errorEmitted = true;
            stream.emit('error', er);
        }

        function onwriteStateUpdate(state) {
            state.writing = false;
            state.writecb = null;
            state.length -= state.writelen;
            state.writelen = 0;
        }

        function onwrite(stream, er) {
            var state = stream._writableState;
            var sync = state.sync;
            var cb = state.writecb;

            onwriteStateUpdate(state);

            if (er)
                onwriteError(stream, state, sync, er, cb);
            else {
                // Check if we're actually ready to finish, but don't emit yet
                var finished = needFinish(stream, state);

                if (!finished && !state.bufferProcessing && state.buffer.length)
                    clearBuffer(stream, state);

                if (sync) {
                    process.nextTick(function() {
                        afterWrite(stream, state, finished, cb);
                    });
                } else {
                    afterWrite(stream, state, finished, cb);
                }
            }
        }

        function afterWrite(stream, state, finished, cb) {
            if (!finished)
                onwriteDrain(stream, state);
            cb();
            if (finished)
                finishMaybe(stream, state);
        }

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
        function onwriteDrain(stream, state) {
            if (state.length === 0 && state.needDrain) {
                state.needDrain = false;
                stream.emit('drain');
            }
        }


// if there's something in the buffer waiting, then process it
        function clearBuffer(stream, state) {
            state.bufferProcessing = true;

            for (var c = 0; c < state.buffer.length; c++) {
                var entry = state.buffer[c];
                var chunk = entry.chunk;
                var encoding = entry.encoding;
                var cb = entry.callback;
                var len = state.objectMode ? 1 : chunk.length;

                doWrite(stream, state, len, chunk, encoding, cb);

                // if we didn't call the onwrite immediately, then
                // it means that we need to wait until it does.
                // also, that means that the chunk and cb are currently
                // being processed, so move the buffer counter past them.
                if (state.writing) {
                    c++;
                    break;
                }
            }

            state.bufferProcessing = false;
            if (c < state.buffer.length)
                state.buffer = state.buffer.slice(c);
            else
                state.buffer.length = 0;
        }

        Writable.prototype._write = function(chunk, encoding, cb) {
            cb(new Error('not implemented'));
        };

        Writable.prototype.end = function(chunk, encoding, cb) {
            var state = this._writableState;

            if (typeof chunk === 'function') {
                cb = chunk;
                chunk = null;
                encoding = null;
            } else if (typeof encoding === 'function') {
                cb = encoding;
                encoding = null;
            }

            if (typeof chunk !== 'undefined' && chunk !== null)
                this.write(chunk, encoding);

            // ignore unnecessary end() calls.
            if (!state.ending && !state.finished)
                endWritable(this, state, cb);
        };


        function needFinish(stream, state) {
            return (state.ending &&
                state.length === 0 &&
                !state.finished &&
                !state.writing);
        }

        function finishMaybe(stream, state) {
            var need = needFinish(stream, state);
            if (need) {
                state.finished = true;
                stream.emit('finish');
            }
            return need;
        }

        function endWritable(stream, state, cb) {
            state.ending = true;
            finishMaybe(stream, state);
            if (cb) {
                if (state.finished)
                    process.nextTick(cb);
                else
                    stream.once('finish', cb);
            }
            state.ended = true;
        }

    }).call(this,require("kuNg5g"))
},{"./_stream_duplex":23,"buffer":2,"core-util-is":28,"inherits":16,"kuNg5g":17,"stream":35}],28:[function(require,module,exports){
    (function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
        function isArray(ar) {
            return Array.isArray(ar);
        }
        exports.isArray = isArray;

        function isBoolean(arg) {
            return typeof arg === 'boolean';
        }
        exports.isBoolean = isBoolean;

        function isNull(arg) {
            return arg === null;
        }
        exports.isNull = isNull;

        function isNullOrUndefined(arg) {
            return arg == null;
        }
        exports.isNullOrUndefined = isNullOrUndefined;

        function isNumber(arg) {
            return typeof arg === 'number';
        }
        exports.isNumber = isNumber;

        function isString(arg) {
            return typeof arg === 'string';
        }
        exports.isString = isString;

        function isSymbol(arg) {
            return typeof arg === 'symbol';
        }
        exports.isSymbol = isSymbol;

        function isUndefined(arg) {
            return arg === void 0;
        }
        exports.isUndefined = isUndefined;

        function isRegExp(re) {
            return isObject(re) && objectToString(re) === '[object RegExp]';
        }
        exports.isRegExp = isRegExp;

        function isObject(arg) {
            return typeof arg === 'object' && arg !== null;
        }
        exports.isObject = isObject;

        function isDate(d) {
            return isObject(d) && objectToString(d) === '[object Date]';
        }
        exports.isDate = isDate;

        function isError(e) {
            return isObject(e) &&
                (objectToString(e) === '[object Error]' || e instanceof Error);
        }
        exports.isError = isError;

        function isFunction(arg) {
            return typeof arg === 'function';
        }
        exports.isFunction = isFunction;

        function isPrimitive(arg) {
            return arg === null ||
                typeof arg === 'boolean' ||
                typeof arg === 'number' ||
                typeof arg === 'string' ||
                typeof arg === 'symbol' ||  // ES6 symbol
                typeof arg === 'undefined';
        }
        exports.isPrimitive = isPrimitive;

        function isBuffer(arg) {
            return Buffer.isBuffer(arg);
        }
        exports.isBuffer = isBuffer;

        function objectToString(o) {
            return Object.prototype.toString.call(o);
        }
    }).call(this,require("buffer").Buffer)
},{"buffer":2}],29:[function(require,module,exports){
    module.exports = Array.isArray || function (arr) {
        return Object.prototype.toString.call(arr) == '[object Array]';
    };

},{}],30:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

    var Buffer = require('buffer').Buffer;

    var isBufferEncoding = Buffer.isEncoding
        || function(encoding) {
            switch (encoding && encoding.toLowerCase()) {
                case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
                default: return false;
            }
        }


    function assertEncoding(encoding) {
        if (encoding && !isBufferEncoding(encoding)) {
            throw new Error('Unknown encoding: ' + encoding);
        }
    }

    var StringDecoder = exports.StringDecoder = function(encoding) {
        this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
        assertEncoding(encoding);
        switch (this.encoding) {
            case 'utf8':
                // CESU-8 represents each of Surrogate Pair by 3-bytes
                this.surrogateSize = 3;
                break;
            case 'ucs2':
            case 'utf16le':
                // UTF-16 represents each of Surrogate Pair by 2-bytes
                this.surrogateSize = 2;
                this.detectIncompleteChar = utf16DetectIncompleteChar;
                break;
            case 'base64':
                // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
                this.surrogateSize = 3;
                this.detectIncompleteChar = base64DetectIncompleteChar;
                break;
            default:
                this.write = passThroughWrite;
                return;
        }

        this.charBuffer = new Buffer(6);
        this.charReceived = 0;
        this.charLength = 0;
    };


    StringDecoder.prototype.write = function(buffer) {
        var charStr = '';
        var offset = 0;

        // if our last write ended with an incomplete multibyte character
        while (this.charLength) {
            // determine how many remaining bytes this buffer has to offer for this char
            var i = (buffer.length >= this.charLength - this.charReceived) ?
                this.charLength - this.charReceived :
                buffer.length;

            // add the new bytes to the char buffer
            buffer.copy(this.charBuffer, this.charReceived, offset, i);
            this.charReceived += (i - offset);
            offset = i;

            if (this.charReceived < this.charLength) {
                // still not enough chars in this buffer? wait for more ...
                return '';
            }

            // get the character that was split
            charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

            // lead surrogate (D800-DBFF) is also the incomplete character
            var charCode = charStr.charCodeAt(charStr.length - 1);
            if (charCode >= 0xD800 && charCode <= 0xDBFF) {
                this.charLength += this.surrogateSize;
                charStr = '';
                continue;
            }
            this.charReceived = this.charLength = 0;

            // if there are no more bytes in this buffer, just emit our char
            if (i == buffer.length) return charStr;

            // otherwise cut off the characters end from the beginning of this buffer
            buffer = buffer.slice(i, buffer.length);
            break;
        }

        var lenIncomplete = this.detectIncompleteChar(buffer);

        var end = buffer.length;
        if (this.charLength) {
            // buffer the incomplete character bytes we got
            buffer.copy(this.charBuffer, 0, buffer.length - lenIncomplete, end);
            this.charReceived = lenIncomplete;
            end -= lenIncomplete;
        }

        charStr += buffer.toString(this.encoding, 0, end);

        var end = charStr.length - 1;
        var charCode = charStr.charCodeAt(end);
        // lead surrogate (D800-DBFF) is also the incomplete character
        if (charCode >= 0xD800 && charCode <= 0xDBFF) {
            var size = this.surrogateSize;
            this.charLength += size;
            this.charReceived += size;
            this.charBuffer.copy(this.charBuffer, size, 0, size);
            this.charBuffer.write(charStr.charAt(charStr.length - 1), this.encoding);
            return charStr.substring(0, end);
        }

        // or just emit the charStr
        return charStr;
    };

    StringDecoder.prototype.detectIncompleteChar = function(buffer) {
        // determine how many bytes we have to check at the end of this buffer
        var i = (buffer.length >= 3) ? 3 : buffer.length;

        // Figure out if one of the last i bytes of our buffer announces an
        // incomplete char.
        for (; i > 0; i--) {
            var c = buffer[buffer.length - i];

            // See http://en.wikipedia.org/wiki/UTF-8#Description

            // 110XXXXX
            if (i == 1 && c >> 5 == 0x06) {
                this.charLength = 2;
                break;
            }

            // 1110XXXX
            if (i <= 2 && c >> 4 == 0x0E) {
                this.charLength = 3;
                break;
            }

            // 11110XXX
            if (i <= 3 && c >> 3 == 0x1E) {
                this.charLength = 4;
                break;
            }
        }

        return i;
    };

    StringDecoder.prototype.end = function(buffer) {
        var res = '';
        if (buffer && buffer.length)
            res = this.write(buffer);

        if (this.charReceived) {
            var cr = this.charReceived;
            var buf = this.charBuffer;
            var enc = this.encoding;
            res += buf.slice(0, cr).toString(enc);
        }

        return res;
    };

    function passThroughWrite(buffer) {
        return buffer.toString(this.encoding);
    }

    function utf16DetectIncompleteChar(buffer) {
        var incomplete = this.charReceived = buffer.length % 2;
        this.charLength = incomplete ? 2 : 0;
        return incomplete;
    }

    function base64DetectIncompleteChar(buffer) {
        var incomplete = this.charReceived = buffer.length % 3;
        this.charLength = incomplete ? 3 : 0;
        return incomplete;
    }

},{"buffer":2}],31:[function(require,module,exports){
    module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":24}],32:[function(require,module,exports){
    exports = module.exports = require('./lib/_stream_readable.js');
    exports.Readable = exports;
    exports.Writable = require('./lib/_stream_writable.js');
    exports.Duplex = require('./lib/_stream_duplex.js');
    exports.Transform = require('./lib/_stream_transform.js');
    exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":23,"./lib/_stream_passthrough.js":24,"./lib/_stream_readable.js":25,"./lib/_stream_transform.js":26,"./lib/_stream_writable.js":27}],33:[function(require,module,exports){
    module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":26}],34:[function(require,module,exports){
    module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":27}],35:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

    module.exports = Stream;

    var EE = require('events').EventEmitter;
    var inherits = require('inherits');

    inherits(Stream, EE);
    Stream.Readable = require('readable-stream/readable.js');
    Stream.Writable = require('readable-stream/writable.js');
    Stream.Duplex = require('readable-stream/duplex.js');
    Stream.Transform = require('readable-stream/transform.js');
    Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
    Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

    function Stream() {
        EE.call(this);
    }

    Stream.prototype.pipe = function(dest, options) {
        var source = this;

        function ondata(chunk) {
            if (dest.writable) {
                if (false === dest.write(chunk) && source.pause) {
                    source.pause();
                }
            }
        }

        source.on('data', ondata);

        function ondrain() {
            if (source.readable && source.resume) {
                source.resume();
            }
        }

        dest.on('drain', ondrain);

        // If the 'end' option is not supplied, dest.end() will be called when
        // source gets the 'end' or 'close' events.  Only dest.end() once.
        if (!dest._isStdio && (!options || options.end !== false)) {
            source.on('end', onend);
            source.on('close', onclose);
        }

        var didOnEnd = false;
        function onend() {
            if (didOnEnd) return;
            didOnEnd = true;

            dest.end();
        }


        function onclose() {
            if (didOnEnd) return;
            didOnEnd = true;

            if (typeof dest.destroy === 'function') dest.destroy();
        }

        // don't leave dangling pipes when there are errors.
        function onerror(er) {
            cleanup();
            if (EE.listenerCount(this, 'error') === 0) {
                throw er; // Unhandled stream error in pipe.
            }
        }

        source.on('error', onerror);
        dest.on('error', onerror);

        // remove all the event listeners that were added.
        function cleanup() {
            source.removeListener('data', ondata);
            dest.removeListener('drain', ondrain);

            source.removeListener('end', onend);
            source.removeListener('close', onclose);

            source.removeListener('error', onerror);
            dest.removeListener('error', onerror);

            source.removeListener('end', cleanup);
            source.removeListener('close', cleanup);

            dest.removeListener('close', cleanup);
        }

        source.on('end', cleanup);
        source.on('close', cleanup);

        dest.on('close', cleanup);

        dest.emit('pipe', source);

        // Allow for unix-like usage: A.pipe(B).pipe(C)
        return dest;
    };

},{"events":11,"inherits":16,"readable-stream/duplex.js":22,"readable-stream/passthrough.js":31,"readable-stream/readable.js":32,"readable-stream/transform.js":33,"readable-stream/writable.js":34}],36:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

    var punycode = require('punycode');

    exports.parse = urlParse;
    exports.resolve = urlResolve;
    exports.resolveObject = urlResolveObject;
    exports.format = urlFormat;

    exports.Url = Url;

    function Url() {
        this.protocol = null;
        this.slashes = null;
        this.auth = null;
        this.host = null;
        this.port = null;
        this.hostname = null;
        this.hash = null;
        this.search = null;
        this.query = null;
        this.pathname = null;
        this.path = null;
        this.href = null;
    }

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
    var protocolPattern = /^([a-z0-9.+-]+:)/i,
        portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
        delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
        unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
        autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
        nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
        hostEndingChars = ['/', '?', '#'],
        hostnameMaxLen = 255,
        hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
        hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
        unsafeProtocol = {
            'javascript': true,
            'javascript:': true
        },
    // protocols that never have a hostname.
        hostlessProtocol = {
            'javascript': true,
            'javascript:': true
        },
    // protocols that always contain a // bit.
        slashedProtocol = {
            'http': true,
            'https': true,
            'ftp': true,
            'gopher': true,
            'file': true,
            'http:': true,
            'https:': true,
            'ftp:': true,
            'gopher:': true,
            'file:': true
        },
        querystring = require('querystring');

    function urlParse(url, parseQueryString, slashesDenoteHost) {
        if (url && isObject(url) && url instanceof Url) return url;

        var u = new Url;
        u.parse(url, parseQueryString, slashesDenoteHost);
        return u;
    }

    Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
        if (!isString(url)) {
            throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
        }

        var rest = url;

        // trim before proceeding.
        // This is to support parse stuff like "  http://foo.com  \n"
        rest = rest.trim();

        var proto = protocolPattern.exec(rest);
        if (proto) {
            proto = proto[0];
            var lowerProto = proto.toLowerCase();
            this.protocol = lowerProto;
            rest = rest.substr(proto.length);
        }

        // figure out if it's got a host
        // user@server is *always* interpreted as a hostname, and url
        // resolution will treat //foo/bar as host=foo,path=bar because that's
        // how the browser resolves relative URLs.
        if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
            var slashes = rest.substr(0, 2) === '//';
            if (slashes && !(proto && hostlessProtocol[proto])) {
                rest = rest.substr(2);
                this.slashes = true;
            }
        }

        if (!hostlessProtocol[proto] &&
            (slashes || (proto && !slashedProtocol[proto]))) {

            // there's a hostname.
            // the first instance of /, ?, ;, or # ends the host.
            //
            // If there is an @ in the hostname, then non-host chars *are* allowed
            // to the left of the last @ sign, unless some host-ending character
            // comes *before* the @-sign.
            // URLs are obnoxious.
            //
            // ex:
            // http://a@b@c/ => user:a@b host:c
            // http://a@b?@c => user:a host:c path:/?@c

            // v0.12 TODO(isaacs): This is not quite how Chrome does things.
            // Review our test case against browsers more comprehensively.

            // find the first instance of any hostEndingChars
            var hostEnd = -1;
            for (var i = 0; i < hostEndingChars.length; i++) {
                var hec = rest.indexOf(hostEndingChars[i]);
                if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
                    hostEnd = hec;
            }

            // at this point, either we have an explicit point where the
            // auth portion cannot go past, or the last @ char is the decider.
            var auth, atSign;
            if (hostEnd === -1) {
                // atSign can be anywhere.
                atSign = rest.lastIndexOf('@');
            } else {
                // atSign must be in auth portion.
                // http://a@b/c@d => host:b auth:a path:/c@d
                atSign = rest.lastIndexOf('@', hostEnd);
            }

            // Now we have a portion which is definitely the auth.
            // Pull that off.
            if (atSign !== -1) {
                auth = rest.slice(0, atSign);
                rest = rest.slice(atSign + 1);
                this.auth = decodeURIComponent(auth);
            }

            // the host is the remaining to the left of the first non-host char
            hostEnd = -1;
            for (var i = 0; i < nonHostChars.length; i++) {
                var hec = rest.indexOf(nonHostChars[i]);
                if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
                    hostEnd = hec;
            }
            // if we still have not hit it, then the entire thing is a host.
            if (hostEnd === -1)
                hostEnd = rest.length;

            this.host = rest.slice(0, hostEnd);
            rest = rest.slice(hostEnd);

            // pull out port.
            this.parseHost();

            // we've indicated that there is a hostname,
            // so even if it's empty, it has to be present.
            this.hostname = this.hostname || '';

            // if hostname begins with [ and ends with ]
            // assume that it's an IPv6 address.
            var ipv6Hostname = this.hostname[0] === '[' &&
                this.hostname[this.hostname.length - 1] === ']';

            // validate a little.
            if (!ipv6Hostname) {
                var hostparts = this.hostname.split(/\./);
                for (var i = 0, l = hostparts.length; i < l; i++) {
                    var part = hostparts[i];
                    if (!part) continue;
                    if (!part.match(hostnamePartPattern)) {
                        var newpart = '';
                        for (var j = 0, k = part.length; j < k; j++) {
                            if (part.charCodeAt(j) > 127) {
                                // we replace non-ASCII char with a temporary placeholder
                                // we need this to make sure size of hostname is not
                                // broken by replacing non-ASCII by nothing
                                newpart += 'x';
                            } else {
                                newpart += part[j];
                            }
                        }
                        // we test again with ASCII char only
                        if (!newpart.match(hostnamePartPattern)) {
                            var validParts = hostparts.slice(0, i);
                            var notHost = hostparts.slice(i + 1);
                            var bit = part.match(hostnamePartStart);
                            if (bit) {
                                validParts.push(bit[1]);
                                notHost.unshift(bit[2]);
                            }
                            if (notHost.length) {
                                rest = '/' + notHost.join('.') + rest;
                            }
                            this.hostname = validParts.join('.');
                            break;
                        }
                    }
                }
            }

            if (this.hostname.length > hostnameMaxLen) {
                this.hostname = '';
            } else {
                // hostnames are always lower case.
                this.hostname = this.hostname.toLowerCase();
            }

            if (!ipv6Hostname) {
                // IDNA Support: Returns a puny coded representation of "domain".
                // It only converts the part of the domain name that
                // has non ASCII characters. I.e. it dosent matter if
                // you call it with a domain that already is in ASCII.
                var domainArray = this.hostname.split('.');
                var newOut = [];
                for (var i = 0; i < domainArray.length; ++i) {
                    var s = domainArray[i];
                    newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
                        'xn--' + punycode.encode(s) : s);
                }
                this.hostname = newOut.join('.');
            }

            var p = this.port ? ':' + this.port : '';
            var h = this.hostname || '';
            this.host = h + p;
            this.href += this.host;

            // strip [ and ] from the hostname
            // the host field still retains them, though
            if (ipv6Hostname) {
                this.hostname = this.hostname.substr(1, this.hostname.length - 2);
                if (rest[0] !== '/') {
                    rest = '/' + rest;
                }
            }
        }

        // now rest is set to the post-host stuff.
        // chop off any delim chars.
        if (!unsafeProtocol[lowerProto]) {

            // First, make 100% sure that any "autoEscape" chars get
            // escaped, even if encodeURIComponent doesn't think they
            // need to be.
            for (var i = 0, l = autoEscape.length; i < l; i++) {
                var ae = autoEscape[i];
                var esc = encodeURIComponent(ae);
                if (esc === ae) {
                    esc = escape(ae);
                }
                rest = rest.split(ae).join(esc);
            }
        }


        // chop off from the tail first.
        var hash = rest.indexOf('#');
        if (hash !== -1) {
            // got a fragment string.
            this.hash = rest.substr(hash);
            rest = rest.slice(0, hash);
        }
        var qm = rest.indexOf('?');
        if (qm !== -1) {
            this.search = rest.substr(qm);
            this.query = rest.substr(qm + 1);
            if (parseQueryString) {
                this.query = querystring.parse(this.query);
            }
            rest = rest.slice(0, qm);
        } else if (parseQueryString) {
            // no query string, but parseQueryString still requested
            this.search = '';
            this.query = {};
        }
        if (rest) this.pathname = rest;
        if (slashedProtocol[lowerProto] &&
            this.hostname && !this.pathname) {
            this.pathname = '/';
        }

        //to support http.request
        if (this.pathname || this.search) {
            var p = this.pathname || '';
            var s = this.search || '';
            this.path = p + s;
        }

        // finally, reconstruct the href based on what has been validated.
        this.href = this.format();
        return this;
    };

// format a parsed object into a url string
    function urlFormat(obj) {
        // ensure it's an object, and not a string url.
        // If it's an obj, this is a no-op.
        // this way, you can call url_format() on strings
        // to clean up potentially wonky urls.
        if (isString(obj)) obj = urlParse(obj);
        if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
        return obj.format();
    }

    Url.prototype.format = function() {
        var auth = this.auth || '';
        if (auth) {
            auth = encodeURIComponent(auth);
            auth = auth.replace(/%3A/i, ':');
            auth += '@';
        }

        var protocol = this.protocol || '',
            pathname = this.pathname || '',
            hash = this.hash || '',
            host = false,
            query = '';

        if (this.host) {
            host = auth + this.host;
        } else if (this.hostname) {
            host = auth + (this.hostname.indexOf(':') === -1 ?
                this.hostname :
                '[' + this.hostname + ']');
            if (this.port) {
                host += ':' + this.port;
            }
        }

        if (this.query &&
            isObject(this.query) &&
            Object.keys(this.query).length) {
            query = querystring.stringify(this.query);
        }

        var search = this.search || (query && ('?' + query)) || '';

        if (protocol && protocol.substr(-1) !== ':') protocol += ':';

        // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
        // unless they had them to begin with.
        if (this.slashes ||
            (!protocol || slashedProtocol[protocol]) && host !== false) {
            host = '//' + (host || '');
            if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
        } else if (!host) {
            host = '';
        }

        if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
        if (search && search.charAt(0) !== '?') search = '?' + search;

        pathname = pathname.replace(/[?#]/g, function(match) {
            return encodeURIComponent(match);
        });
        search = search.replace('#', '%23');

        return protocol + host + pathname + search + hash;
    };

    function urlResolve(source, relative) {
        return urlParse(source, false, true).resolve(relative);
    }

    Url.prototype.resolve = function(relative) {
        return this.resolveObject(urlParse(relative, false, true)).format();
    };

    function urlResolveObject(source, relative) {
        if (!source) return relative;
        return urlParse(source, false, true).resolveObject(relative);
    }

    Url.prototype.resolveObject = function(relative) {
        if (isString(relative)) {
            var rel = new Url();
            rel.parse(relative, false, true);
            relative = rel;
        }

        var result = new Url();
        Object.keys(this).forEach(function(k) {
            result[k] = this[k];
        }, this);

        // hash is always overridden, no matter what.
        // even href="" will remove it.
        result.hash = relative.hash;

        // if the relative url is empty, then there's nothing left to do here.
        if (relative.href === '') {
            result.href = result.format();
            return result;
        }

        // hrefs like //foo/bar always cut to the protocol.
        if (relative.slashes && !relative.protocol) {
            // take everything except the protocol from relative
            Object.keys(relative).forEach(function(k) {
                if (k !== 'protocol')
                    result[k] = relative[k];
            });

            //urlParse appends trailing / to urls like http://www.example.com
            if (slashedProtocol[result.protocol] &&
                result.hostname && !result.pathname) {
                result.path = result.pathname = '/';
            }

            result.href = result.format();
            return result;
        }

        if (relative.protocol && relative.protocol !== result.protocol) {
            // if it's a known url protocol, then changing
            // the protocol does weird things
            // first, if it's not file:, then we MUST have a host,
            // and if there was a path
            // to begin with, then we MUST have a path.
            // if it is file:, then the host is dropped,
            // because that's known to be hostless.
            // anything else is assumed to be absolute.
            if (!slashedProtocol[relative.protocol]) {
                Object.keys(relative).forEach(function(k) {
                    result[k] = relative[k];
                });
                result.href = result.format();
                return result;
            }

            result.protocol = relative.protocol;
            if (!relative.host && !hostlessProtocol[relative.protocol]) {
                var relPath = (relative.pathname || '').split('/');
                while (relPath.length && !(relative.host = relPath.shift()));
                if (!relative.host) relative.host = '';
                if (!relative.hostname) relative.hostname = '';
                if (relPath[0] !== '') relPath.unshift('');
                if (relPath.length < 2) relPath.unshift('');
                result.pathname = relPath.join('/');
            } else {
                result.pathname = relative.pathname;
            }
            result.search = relative.search;
            result.query = relative.query;
            result.host = relative.host || '';
            result.auth = relative.auth;
            result.hostname = relative.hostname || relative.host;
            result.port = relative.port;
            // to support http.request
            if (result.pathname || result.search) {
                var p = result.pathname || '';
                var s = result.search || '';
                result.path = p + s;
            }
            result.slashes = result.slashes || relative.slashes;
            result.href = result.format();
            return result;
        }

        var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
            isRelAbs = (
                relative.host ||
                relative.pathname && relative.pathname.charAt(0) === '/'
                ),
            mustEndAbs = (isRelAbs || isSourceAbs ||
                (result.host && relative.pathname)),
            removeAllDots = mustEndAbs,
            srcPath = result.pathname && result.pathname.split('/') || [],
            relPath = relative.pathname && relative.pathname.split('/') || [],
            psychotic = result.protocol && !slashedProtocol[result.protocol];

        // if the url is a non-slashed url, then relative
        // links like ../.. should be able
        // to crawl up to the hostname, as well.  This is strange.
        // result.protocol has already been set by now.
        // Later on, put the first path part into the host field.
        if (psychotic) {
            result.hostname = '';
            result.port = null;
            if (result.host) {
                if (srcPath[0] === '') srcPath[0] = result.host;
                else srcPath.unshift(result.host);
            }
            result.host = '';
            if (relative.protocol) {
                relative.hostname = null;
                relative.port = null;
                if (relative.host) {
                    if (relPath[0] === '') relPath[0] = relative.host;
                    else relPath.unshift(relative.host);
                }
                relative.host = null;
            }
            mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
        }

        if (isRelAbs) {
            // it's absolute.
            result.host = (relative.host || relative.host === '') ?
                relative.host : result.host;
            result.hostname = (relative.hostname || relative.hostname === '') ?
                relative.hostname : result.hostname;
            result.search = relative.search;
            result.query = relative.query;
            srcPath = relPath;
            // fall through to the dot-handling below.
        } else if (relPath.length) {
            // it's relative
            // throw away the existing file, and take the new path instead.
            if (!srcPath) srcPath = [];
            srcPath.pop();
            srcPath = srcPath.concat(relPath);
            result.search = relative.search;
            result.query = relative.query;
        } else if (!isNullOrUndefined(relative.search)) {
            // just pull out the search.
            // like href='?foo'.
            // Put this after the other two cases because it simplifies the booleans
            if (psychotic) {
                result.hostname = result.host = srcPath.shift();
                //occationaly the auth can get stuck only in host
                //this especialy happens in cases like
                //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
                var authInHost = result.host && result.host.indexOf('@') > 0 ?
                    result.host.split('@') : false;
                if (authInHost) {
                    result.auth = authInHost.shift();
                    result.host = result.hostname = authInHost.shift();
                }
            }
            result.search = relative.search;
            result.query = relative.query;
            //to support http.request
            if (!isNull(result.pathname) || !isNull(result.search)) {
                result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
            }
            result.href = result.format();
            return result;
        }

        if (!srcPath.length) {
            // no path at all.  easy.
            // we've already handled the other stuff above.
            result.pathname = null;
            //to support http.request
            if (result.search) {
                result.path = '/' + result.search;
            } else {
                result.path = null;
            }
            result.href = result.format();
            return result;
        }

        // if a url ENDs in . or .., then it must get a trailing slash.
        // however, if it ends in anything else non-slashy,
        // then it must NOT get a trailing slash.
        var last = srcPath.slice(-1)[0];
        var hasTrailingSlash = (
            (result.host || relative.host) && (last === '.' || last === '..') ||
            last === '');

        // strip single dots, resolve double dots to parent dir
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = srcPath.length; i >= 0; i--) {
            last = srcPath[i];
            if (last == '.') {
                srcPath.splice(i, 1);
            } else if (last === '..') {
                srcPath.splice(i, 1);
                up++;
            } else if (up) {
                srcPath.splice(i, 1);
                up--;
            }
        }

        // if the path is allowed to go above the root, restore leading ..s
        if (!mustEndAbs && !removeAllDots) {
            for (; up--; up) {
                srcPath.unshift('..');
            }
        }

        if (mustEndAbs && srcPath[0] !== '' &&
            (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
            srcPath.unshift('');
        }

        if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
            srcPath.push('');
        }

        var isAbsolute = srcPath[0] === '' ||
            (srcPath[0] && srcPath[0].charAt(0) === '/');

        // put the host back
        if (psychotic) {
            result.hostname = result.host = isAbsolute ? '' :
                srcPath.length ? srcPath.shift() : '';
            //occationaly the auth can get stuck only in host
            //this especialy happens in cases like
            //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
            var authInHost = result.host && result.host.indexOf('@') > 0 ?
                result.host.split('@') : false;
            if (authInHost) {
                result.auth = authInHost.shift();
                result.host = result.hostname = authInHost.shift();
            }
        }

        mustEndAbs = mustEndAbs || (result.host && srcPath.length);

        if (mustEndAbs && !isAbsolute) {
            srcPath.unshift('');
        }

        if (!srcPath.length) {
            result.pathname = null;
            result.path = null;
        } else {
            result.pathname = srcPath.join('/');
        }

        //to support request.http
        if (!isNull(result.pathname) || !isNull(result.search)) {
            result.path = (result.pathname ? result.pathname : '') +
                (result.search ? result.search : '');
        }
        result.auth = relative.auth || result.auth;
        result.slashes = result.slashes || relative.slashes;
        result.href = result.format();
        return result;
    };

    Url.prototype.parseHost = function() {
        var host = this.host;
        var port = portPattern.exec(host);
        if (port) {
            port = port[0];
            if (port !== ':') {
                this.port = port.substr(1);
            }
            host = host.substr(0, host.length - port.length);
        }
        if (host) this.hostname = host;
    };

    function isString(arg) {
        return typeof arg === "string";
    }

    function isObject(arg) {
        return typeof arg === 'object' && arg !== null;
    }

    function isNull(arg) {
        return arg === null;
    }
    function isNullOrUndefined(arg) {
        return  arg == null;
    }

},{"punycode":18,"querystring":21}],37:[function(require,module,exports){
    module.exports = function isBuffer(arg) {
        return arg && typeof arg === 'object'
            && typeof arg.copy === 'function'
            && typeof arg.fill === 'function'
            && typeof arg.readUInt8 === 'function';
    }
},{}],38:[function(require,module,exports){
    (function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

        var formatRegExp = /%[sdj%]/g;
        exports.format = function(f) {
            if (!isString(f)) {
                var objects = [];
                for (var i = 0; i < arguments.length; i++) {
                    objects.push(inspect(arguments[i]));
                }
                return objects.join(' ');
            }

            var i = 1;
            var args = arguments;
            var len = args.length;
            var str = String(f).replace(formatRegExp, function(x) {
                if (x === '%%') return '%';
                if (i >= len) return x;
                switch (x) {
                    case '%s': return String(args[i++]);
                    case '%d': return Number(args[i++]);
                    case '%j':
                        try {
                            return JSON.stringify(args[i++]);
                        } catch (_) {
                            return '[Circular]';
                        }
                    default:
                        return x;
                }
            });
            for (var x = args[i]; i < len; x = args[++i]) {
                if (isNull(x) || !isObject(x)) {
                    str += ' ' + x;
                } else {
                    str += ' ' + inspect(x);
                }
            }
            return str;
        };


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
        exports.deprecate = function(fn, msg) {
            // Allow for deprecating things in the process of starting up.
            if (isUndefined(global.process)) {
                return function() {
                    return exports.deprecate(fn, msg).apply(this, arguments);
                };
            }

            if (process.noDeprecation === true) {
                return fn;
            }

            var warned = false;
            function deprecated() {
                if (!warned) {
                    if (process.throwDeprecation) {
                        throw new Error(msg);
                    } else if (process.traceDeprecation) {
                        console.trace(msg);
                    } else {
                        console.error(msg);
                    }
                    warned = true;
                }
                return fn.apply(this, arguments);
            }

            return deprecated;
        };


        var debugs = {};
        var debugEnviron;
        exports.debuglog = function(set) {
            if (isUndefined(debugEnviron))
                debugEnviron = process.env.NODE_DEBUG || '';
            set = set.toUpperCase();
            if (!debugs[set]) {
                if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
                    var pid = process.pid;
                    debugs[set] = function() {
                        var msg = exports.format.apply(exports, arguments);
                        console.error('%s %d: %s', set, pid, msg);
                    };
                } else {
                    debugs[set] = function() {};
                }
            }
            return debugs[set];
        };


        /**
         * Echos the value of a value. Trys to print the value out
         * in the best way possible given the different types.
         *
         * @param {Object} obj The object to print out.
         * @param {Object} opts Optional options object that alters the output.
         */
        /* legacy: obj, showHidden, depth, colors*/
        function inspect(obj, opts) {
            // default options
            var ctx = {
                seen: [],
                stylize: stylizeNoColor
            };
            // legacy...
            if (arguments.length >= 3) ctx.depth = arguments[2];
            if (arguments.length >= 4) ctx.colors = arguments[3];
            if (isBoolean(opts)) {
                // legacy...
                ctx.showHidden = opts;
            } else if (opts) {
                // got an "options" object
                exports._extend(ctx, opts);
            }
            // set default options
            if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
            if (isUndefined(ctx.depth)) ctx.depth = 2;
            if (isUndefined(ctx.colors)) ctx.colors = false;
            if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
            if (ctx.colors) ctx.stylize = stylizeWithColor;
            return formatValue(ctx, obj, ctx.depth);
        }
        exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
        inspect.colors = {
            'bold' : [1, 22],
            'italic' : [3, 23],
            'underline' : [4, 24],
            'inverse' : [7, 27],
            'white' : [37, 39],
            'grey' : [90, 39],
            'black' : [30, 39],
            'blue' : [34, 39],
            'cyan' : [36, 39],
            'green' : [32, 39],
            'magenta' : [35, 39],
            'red' : [31, 39],
            'yellow' : [33, 39]
        };

// Don't use 'blue' not visible on cmd.exe
        inspect.styles = {
            'special': 'cyan',
            'number': 'yellow',
            'boolean': 'yellow',
            'undefined': 'grey',
            'null': 'bold',
            'string': 'green',
            'date': 'magenta',
            // "name": intentionally not styling
            'regexp': 'red'
        };


        function stylizeWithColor(str, styleType) {
            var style = inspect.styles[styleType];

            if (style) {
                return '\u001b[' + inspect.colors[style][0] + 'm' + str +
                    '\u001b[' + inspect.colors[style][1] + 'm';
            } else {
                return str;
            }
        }


        function stylizeNoColor(str, styleType) {
            return str;
        }


        function arrayToHash(array) {
            var hash = {};

            array.forEach(function(val, idx) {
                hash[val] = true;
            });

            return hash;
        }


        function formatValue(ctx, value, recurseTimes) {
            // Provide a hook for user-specified inspect functions.
            // Check that value is an object with an inspect function on it
            if (ctx.customInspect &&
                value &&
                isFunction(value.inspect) &&
                // Filter out the util module, it's inspect function is special
                value.inspect !== exports.inspect &&
                // Also filter out any prototype objects using the circular check.
                !(value.constructor && value.constructor.prototype === value)) {
                var ret = value.inspect(recurseTimes, ctx);
                if (!isString(ret)) {
                    ret = formatValue(ctx, ret, recurseTimes);
                }
                return ret;
            }

            // Primitive types cannot have properties
            var primitive = formatPrimitive(ctx, value);
            if (primitive) {
                return primitive;
            }

            // Look up the keys of the object.
            var keys = Object.keys(value);
            var visibleKeys = arrayToHash(keys);

            if (ctx.showHidden) {
                keys = Object.getOwnPropertyNames(value);
            }

            // IE doesn't make error fields non-enumerable
            // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
            if (isError(value)
                && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
                return formatError(value);
            }

            // Some type of object without properties can be shortcutted.
            if (keys.length === 0) {
                if (isFunction(value)) {
                    var name = value.name ? ': ' + value.name : '';
                    return ctx.stylize('[Function' + name + ']', 'special');
                }
                if (isRegExp(value)) {
                    return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
                }
                if (isDate(value)) {
                    return ctx.stylize(Date.prototype.toString.call(value), 'date');
                }
                if (isError(value)) {
                    return formatError(value);
                }
            }

            var base = '', array = false, braces = ['{', '}'];

            // Make Array say that they are Array
            if (isArray(value)) {
                array = true;
                braces = ['[', ']'];
            }

            // Make functions say that they are functions
            if (isFunction(value)) {
                var n = value.name ? ': ' + value.name : '';
                base = ' [Function' + n + ']';
            }

            // Make RegExps say that they are RegExps
            if (isRegExp(value)) {
                base = ' ' + RegExp.prototype.toString.call(value);
            }

            // Make dates with properties first say the date
            if (isDate(value)) {
                base = ' ' + Date.prototype.toUTCString.call(value);
            }

            // Make error with message first say the error
            if (isError(value)) {
                base = ' ' + formatError(value);
            }

            if (keys.length === 0 && (!array || value.length == 0)) {
                return braces[0] + base + braces[1];
            }

            if (recurseTimes < 0) {
                if (isRegExp(value)) {
                    return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
                } else {
                    return ctx.stylize('[Object]', 'special');
                }
            }

            ctx.seen.push(value);

            var output;
            if (array) {
                output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
            } else {
                output = keys.map(function(key) {
                    return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
                });
            }

            ctx.seen.pop();

            return reduceToSingleString(output, base, braces);
        }


        function formatPrimitive(ctx, value) {
            if (isUndefined(value))
                return ctx.stylize('undefined', 'undefined');
            if (isString(value)) {
                var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                    .replace(/'/g, "\\'")
                    .replace(/\\"/g, '"') + '\'';
                return ctx.stylize(simple, 'string');
            }
            if (isNumber(value))
                return ctx.stylize('' + value, 'number');
            if (isBoolean(value))
                return ctx.stylize('' + value, 'boolean');
            // For some reason typeof null is "object", so special case here.
            if (isNull(value))
                return ctx.stylize('null', 'null');
        }


        function formatError(value) {
            return '[' + Error.prototype.toString.call(value) + ']';
        }


        function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
            var output = [];
            for (var i = 0, l = value.length; i < l; ++i) {
                if (hasOwnProperty(value, String(i))) {
                    output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
                        String(i), true));
                } else {
                    output.push('');
                }
            }
            keys.forEach(function(key) {
                if (!key.match(/^\d+$/)) {
                    output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
                        key, true));
                }
            });
            return output;
        }


        function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
            var name, str, desc;
            desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
            if (desc.get) {
                if (desc.set) {
                    str = ctx.stylize('[Getter/Setter]', 'special');
                } else {
                    str = ctx.stylize('[Getter]', 'special');
                }
            } else {
                if (desc.set) {
                    str = ctx.stylize('[Setter]', 'special');
                }
            }
            if (!hasOwnProperty(visibleKeys, key)) {
                name = '[' + key + ']';
            }
            if (!str) {
                if (ctx.seen.indexOf(desc.value) < 0) {
                    if (isNull(recurseTimes)) {
                        str = formatValue(ctx, desc.value, null);
                    } else {
                        str = formatValue(ctx, desc.value, recurseTimes - 1);
                    }
                    if (str.indexOf('\n') > -1) {
                        if (array) {
                            str = str.split('\n').map(function(line) {
                                return '  ' + line;
                            }).join('\n').substr(2);
                        } else {
                            str = '\n' + str.split('\n').map(function(line) {
                                return '   ' + line;
                            }).join('\n');
                        }
                    }
                } else {
                    str = ctx.stylize('[Circular]', 'special');
                }
            }
            if (isUndefined(name)) {
                if (array && key.match(/^\d+$/)) {
                    return str;
                }
                name = JSON.stringify('' + key);
                if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
                    name = name.substr(1, name.length - 2);
                    name = ctx.stylize(name, 'name');
                } else {
                    name = name.replace(/'/g, "\\'")
                        .replace(/\\"/g, '"')
                        .replace(/(^"|"$)/g, "'");
                    name = ctx.stylize(name, 'string');
                }
            }

            return name + ': ' + str;
        }


        function reduceToSingleString(output, base, braces) {
            var numLinesEst = 0;
            var length = output.reduce(function(prev, cur) {
                numLinesEst++;
                if (cur.indexOf('\n') >= 0) numLinesEst++;
                return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
            }, 0);

            if (length > 60) {
                return braces[0] +
                    (base === '' ? '' : base + '\n ') +
                    ' ' +
                    output.join(',\n  ') +
                    ' ' +
                    braces[1];
            }

            return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
        }


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
        function isArray(ar) {
            return Array.isArray(ar);
        }
        exports.isArray = isArray;

        function isBoolean(arg) {
            return typeof arg === 'boolean';
        }
        exports.isBoolean = isBoolean;

        function isNull(arg) {
            return arg === null;
        }
        exports.isNull = isNull;

        function isNullOrUndefined(arg) {
            return arg == null;
        }
        exports.isNullOrUndefined = isNullOrUndefined;

        function isNumber(arg) {
            return typeof arg === 'number';
        }
        exports.isNumber = isNumber;

        function isString(arg) {
            return typeof arg === 'string';
        }
        exports.isString = isString;

        function isSymbol(arg) {
            return typeof arg === 'symbol';
        }
        exports.isSymbol = isSymbol;

        function isUndefined(arg) {
            return arg === void 0;
        }
        exports.isUndefined = isUndefined;

        function isRegExp(re) {
            return isObject(re) && objectToString(re) === '[object RegExp]';
        }
        exports.isRegExp = isRegExp;

        function isObject(arg) {
            return typeof arg === 'object' && arg !== null;
        }
        exports.isObject = isObject;

        function isDate(d) {
            return isObject(d) && objectToString(d) === '[object Date]';
        }
        exports.isDate = isDate;

        function isError(e) {
            return isObject(e) &&
                (objectToString(e) === '[object Error]' || e instanceof Error);
        }
        exports.isError = isError;

        function isFunction(arg) {
            return typeof arg === 'function';
        }
        exports.isFunction = isFunction;

        function isPrimitive(arg) {
            return arg === null ||
                typeof arg === 'boolean' ||
                typeof arg === 'number' ||
                typeof arg === 'string' ||
                typeof arg === 'symbol' ||  // ES6 symbol
                typeof arg === 'undefined';
        }
        exports.isPrimitive = isPrimitive;

        exports.isBuffer = require('./support/isBuffer');

        function objectToString(o) {
            return Object.prototype.toString.call(o);
        }


        function pad(n) {
            return n < 10 ? '0' + n.toString(10) : n.toString(10);
        }


        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
            'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
        function timestamp() {
            var d = new Date();
            var time = [pad(d.getHours()),
                pad(d.getMinutes()),
                pad(d.getSeconds())].join(':');
            return [d.getDate(), months[d.getMonth()], time].join(' ');
        }


// log is just a thin wrapper to console.log that prepends a timestamp
        exports.log = function() {
            console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
        };


        /**
         * Inherit the prototype methods from one constructor into another.
         *
         * The Function.prototype.inherits from lang.js rewritten as a standalone
         * function (not on Function.prototype). NOTE: If this file is to be loaded
         * during bootstrapping this function needs to be rewritten using some native
         * functions as prototype setup using normal JavaScript does not work as
         * expected during bootstrapping (see mirror.js in r114903).
         *
         * @param {function} ctor Constructor function which needs to inherit the
         *     prototype.
         * @param {function} superCtor Constructor function to inherit prototype from.
         */
        exports.inherits = require('inherits');

        exports._extend = function(origin, add) {
            // Don't do anything if add isn't an object
            if (!add || !isObject(add)) return origin;

            var keys = Object.keys(add);
            var i = keys.length;
            while (i--) {
                origin[keys[i]] = add[keys[i]];
            }
            return origin;
        };

        function hasOwnProperty(obj, prop) {
            return Object.prototype.hasOwnProperty.call(obj, prop);
        }

    }).call(this,require("kuNg5g"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":37,"inherits":16,"kuNg5g":17}],"node-crate":[function(require,module,exports){
    module.exports=require('tnk1yY');
},{}],"tnk1yY":[function(require,module,exports){
    (function (Buffer){
        /*
         The MIT License(MIT)
         Copyright(C) 2014 by Stefan Thies, Igor Likhomanov

         Permission is hereby granted, free of charge, to any person obtaining a copy
         of this software and associated documentation files(the "Software"), 
         to deal in the Software without restriction, including without limitation the rights
         to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
         copies of the Software, and to permit persons to whom the Software is
         furnished to do so, subject to the following conditions:

         The above copyright notice and this permission notice shall be included in
         all copies or substantial portions of the Software.

         THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
         IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
         FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
         AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
         LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
         OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
         THE SOFTWARE.
         */



        /* CRATE TYPES
         Id's of all currently available data types:
         According to https://github.com/crate/crate/blob/9796dbc9104f47a97f7cc8d92e1fa98ae84e93a0/docs/sql/rest.txt#L77

         ===== ===================
         Id Data Type
         ===== ===================
         0 Null
         ----- -------------------
         1 Not Supported
         ----- -------------------
         2 Byte
         ----- -------------------
         3 Boolean
         ----- -------------------
         4 String
         ----- -------------------
         5 Ip
         ----- -------------------
         6 Double
         ----- -------------------
         7 Float
         ----- -------------------
         8 Short
         ----- -------------------
         9 Integer
         ----- -------------------
         10 Long
         ----- -------------------
         11 Timestamp
         ----- -------------------
         12 Object
         ----- -------------------
         13 GeoPoint (Double[])
         ----- -------------------
         100 Array
         ----- -------------------
         101 Set
         ===== ===================
         */

        var crateTypes = {
            NULL:           0,
            NOT_SUPPORTED:  1,
            BYTE:           2,
            BOOLEAN:        3,
            STRING:         4,
            IP:             5,
            DOUBLE:         6,
            FLOAT:          7,
            SHORT:          8,
            INTEGER:        9,
            LONG:           10,
            TIMESTAMP:      11,
            OBJECT:         12,
            GEO_POINT:      13,
            ARRAY:          100,
            SET:            101
        }
        exports.types =  crateTypes;
        var Type = require('type-of-is');
        var http = require('http');
        var D = require('d.js')
        var options = {
            host: 'localhost',
            path: '/_sql?types',
            port: '4200',
            method: 'POST',
            headers: {
                'Connection': 'keep-alive'
            }
        };

        var qMarks = '?';

        exports.connect = function(host, port) {
            options.host = host;
            options.port = port;
        }

        /**
         * @param {string} sql
         * @param {string[]} args
         * @param {requestCallback} cb
         */
        function executeSql (sql, args, cb) {
            callback = function(response) {

                var str = ''

                response.on('data', function(chunk) {
                    str += chunk;
                });

                response.on('end', function() {
                    var result = JSON.parse(str);

                    if (result.error) {
                        console.log('error:' + sql)
                        if (cb) cb(result.error, null, null);
                        return;
                    }

                    var jsons = result.rows.map(function(e) {
                        var x = {};
                        for (var i = 0; i < result.cols.length; i++)
                        {
                            if (result.col_types && result.col_types[i] === crateTypes.TIMESTAMP)
                            {
                                x[result.cols[i]] = new Date (e[i]);
                            }  else {
                                x[result.cols[i]] = e[i];
                            }
                        }
                        return x;
                    });
                    result.json = jsons;
                    cb(null, result);
                });

            }

            var req = http.request(options, callback);

            req.write(JSON.stringify({
                stmt: sql,
                args: args
            }));

            req.end();

        }

        /**
         * @param {string} tableName
         * @param {string[]} options
         * @param {requestCallback} cb
         */
        exports.insert = function(tableName, options, cb) {


            if (arguments.length < 3) {
                console.log('missed arguments!');
                return;
            }

            if (!tableName) {
                cb('Table name is not specified', null);
                return;
            }

            if (!options) {
                cb('Record entry is not defined', null);
                return;
            }

            var preparedOptions = prepareOptions(options);
            var preparedQuery = 'INSERT INTO ' + tableName + ' ' + '(' + preparedOptions.keys + ')' + ' VALUES (' + preparedOptions.values + ')';
            executeSql(preparedQuery, preparedOptions.args, cb);
        }

        /**
         * @param {string} tableName
         * @param {string[]} options
         * @param {string} whereClaus
         * @param {requestCallback} cb
         */
        exports.update = function(tableName, options, whereClause, cb) {

            if (arguments.length < 3) {
                console.log('missed arguments!');
                return;
            }

            if (!tableName) {
                cb('Table name is not specified', null);
                return;
            }

            if (!options) {
                cb('Record entry is not defined', null);
                return;
            }

            if (!whereClause) {
                cb('Where clause is not defined', null);
                return;
            }

            var preparedOptions = prepareOptionsInsert(options);

            var preparedQuery = 'UPDATE ' + tableName + ' SET ' + preparedOptions + ' WHERE ' + whereClause;

            executeSql(preparedQuery, preparedOptions.args, cb);
        }

        /**
         * @param {string} tableName
         * @param {string} whereClause
         * @param {requestCallback} cb
         */
        exports.delete = function(tableName, whereClause, cb) {

            if (arguments.length < 3) {
                console.log('missed arguments!');
                return;
            }

            if (!tableName) {
                cb('Table name is not specified', null);
                return;
            }

            if (!whereClause) {
                cb('Where clause is not defined', null);
                return;
            }

            var preparedOptions = prepareOptionsInsert(options);

            var preparedQuery = 'DELETE FROM ' + tableName + ' WHERE ' + whereClause;

            executeSql(preparedQuery, [], cb);
        }

        /**
         * @param {string} tableName
         * @param {string} whereClause
         * @param {requestCallback} cb
         */
        exports.drop = function(tableName, cb) {

            if (!tableName) {
                cb('Table name is not specified', null);
                return;
            }

            if (!cb) {
                cb('Where clause is not defined', null);
                return;
            }



            var preparedQuery = 'DROP TABLE '+tableName;

            executeSql(preparedQuery, [], cb);
        }

        /*
         if 1 args pass - invalid args
         if 2 args pass - 1st: sql, 2: callbak
         if 3 args pass - 1st: sql, 2: args, 3: callback

         */
        exports.execute = function(arg1, arg2, arg3) {

            if (arguments.length < 2) {
                return;
            } else if (arguments.length == 2) {
                executeSql(arg1, [], arg2);
            } else if (arguments.length == 3) {
                executeSql(arg1, arg2, arg3);
            }
        }

        /**
         * @param {string} tableName
         * @param {string} buffer
         * @param {requestCallback} cb
         */
        function insertBlob(tableName, buffer, cb) {

            var crypto = require('crypto');
            var shasum = crypto.createHash('sha1');
            shasum.update(buffer, 'binary')
            var hashCode = shasum.digest('hex');

            var blobOptions = {
                host: options.host,
                path: '/_blobs/' + tableName + '/' + hashCode,
                port: options.port,
                method: 'PUT',
                body: buffer
            };

            callback = function(response) {

                var str = '';
                response.on('data', function(chunk) {
                    str += chunk;
                });

                response.on('end', function() {

                    if (response.statusCode == 409) {
                        cb('error 409: already exists', hashCode);
                        return;
                    }

                    cb(null, hashCode);
                });
            }

            var req = http.request(blobOptions, callback);
            req.write(buffer);
            req.end();
        }

        exports.insertBlob = insertBlob;

        /**
         * @param {string} tableName
         * @param {string} filename
         * @param {requestCallback} cb
         */
        exports.insertBlobFile = function(tableName, filename, cb) {
            var fs = require('fs');

            fs.readFile(filename, function(err, data) {
                if (err) throw err;

                insertBlob('bob', data, cb);

            })
        }

        /**
         * @param {string} tableName
         * @param {string} hashKey
         * @param {requestCallback} cb
         */
        exports.getBlob = function(tableName, hashKey, cb) {

            callback = function(response) {
                var buffer = [];
                response.on('data', function(chunk) {
                    buffer.push(chunk);
                });

                response.on('end', function() {
                    cb(null, Buffer.concat(buffer))
                });
            }

            var reqUrl = 'http://' + options.host + ':' + options.port + '/_blobs/' + tableName + '/' + hashKey;
            http.get(reqUrl, callback);

        }

        /**
         * @param {string[]} options
         * @returns values
         * @returns values.keys
         * @returns values.values
         * @returns values.args
         */
        function prepareOptions(options) {
            var values = {};
            var keys = Object.keys(options);
            values.keys = keys.map(function(i) {
                return '"' + i + '"';
            });
            values.values = keys.map(function(i) {
                return qMarks;
            });
            values.args = keys.map(function(i) {
                return getValueByType (options[i]);
            });
            return values;
        }

        function getValueByType (v)
        {
            if (Type.is (v, Date))
                return v.getTime()
            else return v;
        }

        /**
         * @param {string[]} options
         * @returns values
         * @returns values.keys
         */
        function prepareOptionsInsert(options) {
            var values = {};
            var keys = Object.keys(options);
            values = keys.map(function(i) {
                return i + ' = \'' + getValueByType (options[i]) + '\'';
            });
            return values;
        }

        /**
         * @param {object} schema like: {person: {name: 'string', age: 'integer'}}
         */
        exports.create = function (schema, cbf)
        {
            var cols = []
            var tableName = Object.keys(schema)[0];
            for (key in schema[tableName])
            {
                cols.push (key + ' ' + schema[tableName][key])
            }
            var statement = "CREATE TABLE " + tableName +  " (" + cols + ")"
            executeSql (statement, [], cbf)
        }
        // adding promise .success ./ .error functions
        exports.execute = D.nodeCapsule (exports.execute)
        exports.insert = D.nodeCapsule (exports.insert)
        exports.update = D.nodeCapsule (exports.update)
        exports.delete = D.nodeCapsule (exports.delete)
        exports.getBlob = D.nodeCapsule (exports.getBlob)
        exports.insertBlobFile = D.nodeCapsule (exports.insertBlobFile)
        exports.insertBlob = D.nodeCapsule (exports.insertBlob)
        exports.create = D.nodeCapsule (exports.create)
        exports.drop = D.nodeCapsule (exports.drop)





    }).call(this,require("buffer").Buffer)
},{"buffer":2,"crypto":6,"d.js":41,"fs":1,"http":12,"type-of-is":42}],41:[function(require,module,exports){
    (function (process){
        /**
         * attempt of a simple defer/promise library for mobile development
         * @author Jonathan Gotti < jgotti at jgotti dot net>
         * @since 2012-10
         * @version 0.6.0
         * @changelog
         *           - 2013-12-07 - last promise 1.1 specs test passings (thx to wizardwerdna)
         *                       - reduce promises footprint by unscoping methods that could be
         *           - 2013-10-23 - make it workig across node-webkit contexts
         *           - 2013-07-03 - bug correction in promixify method (thx to adrien gibrat )
         *           - 2013-06-22 - bug correction in nodeCapsule method
         *           - 2013-06-17 - remove unnecessary Array.indexOf method dependency
         *           - 2013-04-18 - add try/catch block around nodeCapsuled methods
         *           - 2013-04-13 - check promises/A+ conformity
         *                        - make some minication optimisations
         *           - 2013-03-26 - add resolved, fulfilled and rejected methods
         *           - 2013-03-21 - browser/node compatible
         *                        - new method nodeCapsule
         *                        - simpler promixify with full api support
         *           - 2013-01-25 - add rethrow method
         *                        - nextTick optimisation -> add support for process.nextTick + MessageChannel where available
         *           - 2012-12-28 - add apply method to promise
         *           - 2012-12-20 - add alwaysAsync parameters and property for default setting
         */
        (function(undef){
            "use strict";

            var nextTick
                , isFunc = function(f){ return ( typeof f === 'function' ); }
                , isArray = function(a){ return Array.isArray ? Array.isArray(a) : (a instanceof Array); }
                , isObjOrFunc = function(o){ return !!(o && (typeof o).match(/function|object/)); }
                , isNotVal = function(v){ return (v === false || v === undef || v === null); }
                , slice = function(a, offset){ return [].slice.call(a, offset); }
                , undefStr = 'undefined'
                , tErr = typeof TypeError === undefStr ? Error : TypeError
                ;
            if ( (typeof process !== undefStr) && process.nextTick ) {
                nextTick = process.nextTick;
            } else if ( typeof MessageChannel !== undefStr ) {
                var ntickChannel = new MessageChannel(), queue = [];
                ntickChannel.port1.onmessage = function(){ queue.length && (queue.shift())(); };
                nextTick = function(cb){
                    queue.push(cb);
                    ntickChannel.port2.postMessage(0);
                };
            } else {
                nextTick = function(cb){ setTimeout(cb, 0); };
            }
            function rethrow(e){ nextTick(function(){ throw e;}); }

            /**
             * @typedef deferred
             * @property {promise} promise
             * @method resolve
             * @method fulfill
             * @method reject
             */

            /**
             * @typedef {function} fulfilled
             * @param {*} value promise resolved value
             * @returns {*} next promise resolution value
             */

            /**
             * @typedef {function} failed
             * @param {*} reason promise rejection reason
             * @returns {*} next promise resolution value or rethrow the reason
             */

            //-- defining unenclosed promise methods --//
            /**
             * same as then without failed callback
             * @param {fulfilled} fulfilled callback
             * @returns {promise} a new promise
             */
            function promise_success(fulfilled){ return this.then(fulfilled, undef); }

            /**
             * same as then with only a failed callback
             * @param {failed} failed callback
             * @returns {promise} a new promise
             */
            function promise_error(failed){ return this.then(undef, failed); }


            /**
             * same as then but fulfilled callback will receive multiple parameters when promise is fulfilled with an Array
             * @param {fulfilled} fulfilled callback
             * @param {failed} failed callback
             * @returns {promise} a new promise
             */
            function promise_apply(fulfilled, failed){
                return this.then(
                    function(a){
                        return isFunc(fulfilled) ? fulfilled.apply(null, isArray(a) ? a : [a]) : (defer.onlyFuncs ? a : fulfilled);
                    }
                    , failed || undef
                );
            }

            /**
             * cleanup method which will be always executed regardless fulfillment or rejection
             * @param {function} cb a callback called regardless of the fulfillment or rejection of the promise which will be called
             *                      when the promise is not pending anymore
             * @returns {promise} the same promise untouched
             */
            function promise_ensure(cb){
                function _cb(){ cb(); }
                this.then(_cb, _cb);
                return this;
            }

            /**
             * take a single callback which wait for an error as first parameter. other resolution values are passed as with the apply/spread method
             * @param {function} cb a callback called regardless of the fulfillment or rejection of the promise which will be called
             *                      when the promise is not pending anymore with error as first parameter if any as in node style
             *                      callback. Rest of parameters will be applied as with the apply method.
             * @returns {promise} a new promise
             */
            function promise_nodify(cb){
                return this.then(
                    function(a){
                        return isFunc(cb) ? cb.apply(null, isArray(a) ? a.splice(0,0,undefined) && a : [undefined,a]) : (defer.onlyFuncs ? a : cb);
                    }
                    , function(e){
                        return cb(e);
                    }
                );
            }

            /**
             *
             * @param {function} [failed] without parameter will only rethrow promise rejection reason outside of the promise library on next tick
             *                            if passed a failed method then will call failed on rejection and throw the error again if failed didn't
             * @returns {promise} a new promise
             */
            function promise_rethrow(failed){
                return this.then(
                    undef
                    , failed ? function(e){ failed(e); throw e; } : rethrow
                );
            }

            /**
             * @param {boolean} [alwaysAsync] if set force the async resolution for this promise independantly of the D.alwaysAsync option
             * @returns {deferred} defered object with property 'promise' and methods reject,fulfill,resolve (fulfill being an alias for resolve)
             */
            var defer = function (alwaysAsync){
                var alwaysAsyncFn = (undef !== alwaysAsync ? alwaysAsync : defer.alwaysAsync) ? nextTick : function(fn){fn();}
                    , status = 0 // -1 failed | 1 fulfilled
                    , pendings = []
                    , value
                /**
                 * @typedef promise
                 */
                    , _promise  = {
                        /**
                         * @param {fulfilled|function} fulfilled callback
                         * @param {failed|function} failed callback
                         * @returns {promise} a new promise
                         */
                        then: function(fulfilled, failed){
                            var d = defer();
                            pendings.push([
                                function(value){
                                    try{
                                        if( isNotVal(fulfilled)){
                                            d.resolve(value);
                                        } else {
                                            d.resolve(isFunc(fulfilled) ? fulfilled(value) : (defer.onlyFuncs ? value : fulfilled));
                                        }
                                    }catch(e){
                                        d.reject(e);
                                    }
                                }
                                , function(err){
                                    if ( isNotVal(failed) || ((!isFunc(failed)) && defer.onlyFuncs) ) {
                                        d.reject(err);
                                    }
                                    if ( failed ) {
                                        try{ d.resolve(isFunc(failed) ? failed(err) : failed); }catch(e){ d.reject(e);}
                                    }
                                }
                            ]);
                            status !== 0 && alwaysAsyncFn(execCallbacks);
                            return d.promise;
                        }

                        , success: promise_success

                        , error: promise_error
                        , otherwise: promise_error

                        , apply: promise_apply
                        , spread: promise_apply

                        , ensure: promise_ensure

                        , nodify: promise_nodify

                        , rethrow: promise_rethrow

                        , isPending: function(){ return !!(status === 0); }

                        , getStatus: function(){ return status; }
                    }
                    ;
                _promise.toSource = _promise.toString = _promise.valueOf = function(){return value === undef ? this : value; };


                function execCallbacks(){
                    if ( status === 0 ) {
                        return;
                    }
                    var cbs = pendings, i = 0, l = cbs.length, cbIndex = ~status ? 0 : 1, cb;
                    pendings = [];
                    for( ; i < l; i++ ){
                        (cb = cbs[i][cbIndex]) && cb(value);
                    }
                }

                /**
                 * fulfill deferred with given value
                 * @param {*} val
                 * @returns {deferred} this for method chaining
                 */
                function _resolve(val){
                    var done = false;
                    function once(f){
                        return function(x){
                            if (done) {
                                return undefined;
                            } else {
                                done = true;
                                return f(x);
                            }
                        };
                    }
                    if ( status ) {
                        return this;
                    }
                    try {
                        var then = isObjOrFunc(val) && val.then;
                        if ( isFunc(then) ) { // managing a promise
                            if( val === _promise ){
                                throw new tErr("Promise can't resolve itself");
                            }
                            then.call(val, once(_resolve), once(_reject));
                            return this;
                        }
                    } catch (e) {
                        once(_reject)(e);
                        return this;
                    }
                    alwaysAsyncFn(function(){
                        value = val;
                        status = 1;
                        execCallbacks();
                    });
                    return this;
                }

                /**
                 * reject deferred with given reason
                 * @param {*} Err
                 * @returns {deferred} this for method chaining
                 */
                function _reject(Err){
                    status || alwaysAsyncFn(function(){
                        try{ throw(Err); }catch(e){ value = e; }
                        status = -1;
                        execCallbacks();
                    });
                    return this;
                }
                return /**@type deferred */ {
                    promise:_promise
                    ,resolve:_resolve
                    ,fulfill:_resolve // alias
                    ,reject:_reject
                };
            };

            defer.deferred = defer.defer = defer;
            defer.nextTick = nextTick;
            defer.alwaysAsync = true; // setting this will change default behaviour. use it only if necessary as asynchronicity will force some delay between your promise resolutions and is not always what you want.
            /**
             * setting onlyFuncs to false will break promises/A+ conformity by allowing you to pass non undefined/null values instead of callbacks
             * instead of just ignoring any non function parameters to then,success,error... it will accept non null|undefined values.
             * this will allow you shortcuts like promise.then('val','handled error'')
             * to be equivalent of promise.then(function(){ return 'val';},function(){ return 'handled error'})
             */
            defer.onlyFuncs = true;

            /**
             * return a fulfilled promise of given value (always async resolution)
             * @param {*} value
             * @returns {promise}
             */
            defer.resolved = defer.fulfilled = function(value){ return defer(true).resolve(value).promise; };

            /**
             * return a rejected promise with given reason of rejection (always async rejection)
             * @param {*} reason
             * @returns {promise}
             */
            defer.rejected = function(reason){ return defer(true).reject(reason).promise; };

            /**
             * return a promise with no resolution value which will be resolved in time ms (using setTimeout)
             * @param {int} [time] in ms default to 0
             * @returns {promise}
             */
            defer.wait = function(time){
                var d = defer();
                setTimeout(d.resolve, time || 0);
                return d.promise;
            };

            /**
             * return a promise for the return value of function call which will be fulfilled in delay ms or rejected if given fn throw an error
             * @param {function} fn
             * @param {int} [delay] in ms default to 0
             * @returns {promise}
             */
            defer.delay = function(fn, delay){
                var d = defer();
                setTimeout(function(){ try{ d.resolve(fn.apply(null)); }catch(e){ d.reject(e); } }, delay || 0);
                return d.promise;
            };

            /**
             * if given value is not a promise return a fulfilled promise resolved to given value
             * @param {*} promise a value or a promise
             * @returns {promise}
             */
            defer.promisify = function(promise){
                if ( promise && isFunc(promise.then) ) { return promise;}
                return defer.resolved(promise);
            };

            function multiPromiseResolver(callerArguments, returnPromises){
                var promises = slice(callerArguments);
                if ( promises.length === 1 && isArray(promises[0]) ) {
                    if(! promises[0].length ){
                        return defer.fulfilled([]);
                    }
                    promises = promises[0];
                }
                var args = []
                    , d = defer()
                    , c = promises.length
                    ;
                if ( !c ) {
                    d.resolve(args);
                } else {
                    var resolver = function(i){
                        promises[i] = defer.promisify(promises[i]);
                        promises[i].then(
                            function(v){
                                if (! (i in args) ) { //@todo check this is still required as promises can't be resolve more than once
                                    args[i] = returnPromises ? promises[i] : v;
                                    (--c) || d.resolve(args);
                                }
                            }
                            , function(e){
                                if(! (i in args) ){
                                    if( ! returnPromises ){
                                        d.reject(e);
                                    } else {
                                        args[i] = promises[i];
                                        (--c) || d.resolve(args);
                                    }
                                }
                            }
                        );
                    };
                    for( var i = 0, l = c; i < l; i++ ){
                        resolver(i);
                    }
                }
                return d.promise;
            }

            /**
             * return a promise for all given promises / values.
             * the returned promises will be fulfilled with a list of resolved value.
             * if any given promise is rejected then on the first rejection the returned promised will be rejected with the same reason
             * @param {array|...*} [promise] can be a single array of promise/values as first parameter or a list of direct parameters promise/value
             * @returns {promise} of a list of given promise resolution value
             */
            defer.all = function(){ return multiPromiseResolver(arguments,false); };

            /**
             * return an always fulfilled promise of array<promise> list of promises/values regardless they resolve fulfilled or rejected
             * @param {array|...*} [promise] can be a single array of promise/values as first parameter or a list of direct parameters promise/value
             *                     (non promise values will be promisified)
             * @returns {promise} of the list of given promises
             */
            defer.resolveAll = function(){ return multiPromiseResolver(arguments,true); };

            /**
             * transform a typical nodejs async method awaiting a callback as last parameter, receiving error as first parameter to a function that
             * will return a promise instead. the returned promise will resolve with normal callback value minus the first error parameter on
             * fulfill and will be rejected with that error as reason in case of error.
             * @param {object} [subject] optional subject of the method to encapsulate
             * @param {function} fn the function to encapsulate if the normal callback should receive more than a single parameter (minus the error)
             *                      the promise will resolve with the list or parameters as fulfillment value. If only one parameter is sent to the
             *                      callback then it will be used as the resolution value.
             * @returns {Function}
             */
            defer.nodeCapsule = function(subject, fn){
                if ( !fn ) {
                    fn = subject;
                    subject = void(0);
                }
                return function(){
                    var d = defer(), args = slice(arguments);
                    args.push(function(err, res){
                        err ? d.reject(err) : d.resolve(arguments.length > 2 ? slice(arguments, 1) : res);
                    });
                    try{
                        fn.apply(subject, args);
                    }catch(e){
                        d.reject(e);
                    }
                    return d.promise;
                };
            };

            typeof window !== undefStr && (window.D = defer);
            typeof module !== undefStr && module.exports && (module.exports = defer);

        })();

    }).call(this,require("kuNg5g"))
},{"kuNg5g":17}],42:[function(require,module,exports){
    (function (factory) {
        if (typeof exports == 'object') {
            module.exports = factory();
        } else if ((typeof define == 'function') && define.amd) {
            define(factory);
        }
    }(function () {

        var isBuiltIn = (function () {
            var built_ins = [
                Object,
                Function,
                Array,
                String,
                Boolean,
                Number,
                Date,
                RegExp,
                Error
            ];
            var built_ins_length = built_ins.length;

            return function (_constructor) {
                for (var i = 0; i < built_ins_length; i++) {
                    if (built_ins[i] === _constructor) {
                        return true;
                    }
                }
                return false;
            };
        })();

        var stringType = (function () {
            var _toString = ({}).toString;

            return function (obj) {
                // [object Blah] -> Blah
                var stype = _toString.call(obj).slice(8, -1);

                if ((obj === null) || (obj === undefined)) {
                    return stype.toLowerCase();
                }

                var ctype = of(obj);

                if (ctype && !isBuiltIn(ctype)) {
                    return ctype.name;
                } else {
                    return stype;
                }
            };
        })();

        function of (obj) {
            if ((obj === null) || (obj === undefined)) {
                return obj;
            } else {
                return obj.constructor;
            }
        }

        function is (obj, test) {
            var typer = (of(test) === String) ? stringType : of;
            return (typer(obj) === test);
        }

        function instance (obj, test) {
            return (obj instanceof test);
        }

        function any (obj, tests) {
            if (!is(tests, Array)) {
                throw ("Second argument to .any() should be array")
            }
            for (var i = 0; i < tests.length; i++) {
                var test = tests[i];
                if (is(obj, test)) {
                    return true;
                }
            }
            return false;
        }

        var exports = function (obj, type) {
            if (arguments.length == 1) {
                return of(obj);
            } else {
                if (is(type, Array)) {
                    return any(obj, type);
                } else {
                    return is(obj, type);
                }
            }
        }

        exports.instance = instance;
        exports.string = stringType;
        exports.of = of;
        exports.is = is;
        exports.any = any;

        return exports;

    }));
},{}]},{},[])