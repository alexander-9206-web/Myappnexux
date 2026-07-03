import Foundation

enum DTCDescriptions {
    static let db: [String: String] = [
        "P0100": "Flujo de aire MAF — circuito",
        "P0171": "Mezcla pobre — banco 1",
        "P0300": "Fallo de encendido múltiple",
        "P0420": "Eficiencia catalizador banco 1",
        "P0700": "Transmisión — fallo general",
        "C0035": "Sensor velocidad rueda delantera izq.",
        "C0200": "Módulo ABS — fallo interno",
        "B1600": "Airbag — luz de advertencia",
        "U0100": "Pérdida comunicación ECM/PCM",
        "U0101": "Pérdida comunicación TCM",
        "U0121": "Pérdida comunicación ABS",
        "U0151": "Pérdida comunicación airbag"
    ]

    static func describe(_ code: String) -> String {
        db[code.uppercased()] ?? "Consulta manual del fabricante"
    }
}

struct DTCParser {
    static func parse(_ raw: String, mode: DTCMode) -> [DiagnosticCode] {
        let hex = raw.uppercased().filter { "0123456789ABCDEF".contains($0) }
        guard hex.count >= 4 else { return [] }

        var data = hex
        for prefix in ["43", "47", "4A", mode.responsePrefix] {
            if let range = data.range(of: prefix) {
                data = String(data[range.upperBound...])
                break
            }
        }

        var codes: [DiagnosticCode] = []
        var i = data.startIndex
        while data.distance(from: i, to: data.endIndex) >= 4 {
            let b1 = Int(data[i..<data.index(i, offsetBy: 2)], radix: 16) ?? 0
            let b2 = Int(data[data.index(i, offsetBy: 2)..<data.index(i, offsetBy: 4)], radix: 16) ?? 0
            i = data.index(i, offsetBy: 4)
            if b1 == 0 && b2 == 0 { continue }

            let types = ["P", "C", "B", "U"]
            let type = types[(b1 >> 6) & 3]
            let d1 = String((b1 >> 4) & 3)
            let d2 = String(format: "%X", b1 & 0x0F)
            let d3 = String(format: "%X", b2 >> 4)
            let d4 = String(format: "%X", b2 & 0x0F)
            let code = "\(type)\(d1)\(d2)\(d3)\(d4)"
            codes.append(DiagnosticCode(id: "\(mode.rawValue)-\(code)", code: code, description: DTCDescriptions.describe(code), mode: mode))
        }
        return codes
    }
}
