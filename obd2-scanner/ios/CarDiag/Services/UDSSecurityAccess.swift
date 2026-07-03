import Foundation

enum UDSSecurityAccess {
    static let defaultLevels = [1, 3, 5, 7, 11, 17, 19]

    static func parseSeed(_ raw: String, requestSub: Int) -> [UInt8]? {
        let hex = raw.uppercased().filter { "0123456789ABCDEF".contains($0) }
        let sub = String(format: "%02X", requestSub)
        let markers = ["67\(sub)", "670\(requestSub)"]
        for marker in markers {
            guard let range = hex.range(of: marker) else { continue }
            var data = String(hex[range.upperBound...])
            var seed: [UInt8] = []
            while data.count >= 2 && seed.count < 8 {
                let byte = UInt8(data.prefix(2), radix: 16) ?? 0
                seed.append(byte)
                data = String(data.dropFirst(2))
            }
            if !seed.isEmpty { return seed }
        }
        return nil
    }

    static func isUnlocked(_ raw: String, responseSub: Int) -> Bool {
        let hex = raw.uppercased()
        let sub = String(format: "%02X", responseSub)
        return hex.contains("67\(sub)") && !hex.contains("7F27")
    }

    static func keyCandidates(seed: [UInt8]) -> [(name: String, key: [UInt8])] {
        var list: [(String, [UInt8])] = []
        list.append(("xor_ff", seed.map { ($0 ^ 0xFF) & 0xFF }))
        list.append(("xor_aa", seed.map { ($0 ^ 0xAA) & 0xFF }))
        list.append(("add_47", seed.map { ($0 &+ 0x47) & 0xFF }))
        list.append(("sub_17", seed.map { ($0 &- 0x17) & 0xFF }))
        list.append(("rot1_xor", seed.map { ((($0 << 1) | ($0 >> 7)) ^ 0x55) & 0xFF }))

        if seed.count >= 2 {
            let s0 = seed[0], s1 = seed[1]
            list.append(("vag_v1", [((s0 &+ 0x33) ^ 0x55) & 0xFF, ((s1 &+ 0x33) ^ 0x55) & 0xFF]))
            list.append(("vag_v2", [(s0 ^ 0xC3) & 0xFF, (s1 ^ 0xC3) & 0xFF]))
            list.append(("psa_v1", [((s0 &* 2) &+ 0x12) & 0xFF, ((s1 &* 2) &+ 0x12) & 0xFF]))
            list.append(("gm_v1", [((s0 << 3) | (s0 >> 5)) ^ 0x91, ((s1 << 3) | (s1 >> 5)) ^ 0x91]))
            list.append(("bmw_v1", [((s0 << 1) | (s0 >> 7)) ^ 0xA5, ((s1 << 1) | (s1 >> 7)) ^ 0xA5]))
            list.append(("ford_v1", [(s0 &+ s1 &+ 0x27) & 0xFF, (s0 ^ s1 ^ 0x4B) & 0xFF]))
        }
        if seed.count == 1 {
            list.append(("single_vag", [((seed[0] &+ 0x33) ^ 0x55) & 0xFF]))
        }
        return list
    }

    static func bytesToHex(_ bytes: [UInt8]) -> String {
        bytes.map { String(format: "%02X", $0) }.joined()
    }
}
