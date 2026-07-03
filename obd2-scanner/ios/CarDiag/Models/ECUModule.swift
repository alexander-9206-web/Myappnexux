import Foundation

struct ECUModule: Identifiable, Hashable {
    let id: String
    let name: String
    let shortName: String
    let icon: String
    let header: String
    let rx: String

    static let all: [ECUModule] = [
        ECUModule(id: "engine", name: "Motor / ECM", shortName: "ECM", icon: "⚙️", header: "7E0", rx: "7E8"),
        ECUModule(id: "transmission", name: "Transmisión / TCM", shortName: "TCM", icon: "⚡", header: "7E1", rx: "7E9"),
        ECUModule(id: "abs", name: "ABS / Frenos", shortName: "ABS", icon: "🛑", header: "7B0", rx: "7B8"),
        ECUModule(id: "airbag", name: "Airbag / SRS", shortName: "SRS", icon: "🛡️", header: "7C0", rx: "7C8"),
        ECUModule(id: "body", name: "Carrocería / BCM", shortName: "BCM", icon: "🚗", header: "726", rx: "72E"),
        ECUModule(id: "hvac", name: "Clima / HVAC", shortName: "HVAC", icon: "❄️", header: "733", rx: "73B"),
        ECUModule(id: "tpms", name: "TPMS / Presión", shortName: "TPMS", icon: "⭕", header: "7D0", rx: "7D8"),
        ECUModule(id: "steering", name: "Dirección / EPS", shortName: "EPS", icon: "🎯", header: "730", rx: "738"),
        ECUModule(id: "cluster", name: "Tablero / IC", shortName: "IC", icon: "📊", header: "720", rx: "728"),
        ECUModule(id: "gateway", name: "Gateway / Red CAN", shortName: "GW", icon: "🔗", header: "710", rx: "718"),
        ECUModule(id: "immobilizer", name: "Inmovilizador", shortName: "SKIM", icon: "🔐", header: "7A0", rx: "7A8"),
        ECUModule(id: "hybrid", name: "Híbrido / Batería", shortName: "BMS", icon: "🔋", header: "7E2", rx: "7EA"),
        ECUModule(id: "parking", name: "Asist. estacionamiento", shortName: "PAM", icon: "📷", header: "7B6", rx: "7BE"),
        ECUModule(id: "radio", name: "Multimedia / Radio", shortName: "RADIO", icon: "📻", header: "7F0", rx: "7F8")
    ]
}

enum DTCMode: String, CaseIterable {
    case stored = "03"
    case pending = "07"
    case permanent = "0A"

    var label: String {
        switch self {
        case .stored: return "Almacenados"
        case .pending: return "Pendientes"
        case .permanent: return "Permanentes"
        }
    }

    var responsePrefix: String {
        switch self {
        case .stored: return "43"
        case .pending: return "47"
        case .permanent: return "4A"
        }
    }
}

struct DiagnosticCode: Identifiable, Hashable {
    let id: String
    let code: String
    let description: String
    let mode: DTCMode
}

struct ModuleScanResult: Identifiable, Hashable {
    let id: String
    let module: ECUModule
    var stored: [DiagnosticCode] = []
    var pending: [DiagnosticCode] = []
    var permanent: [DiagnosticCode] = []
    var error: String?

    var totalCount: Int { stored.count + pending.count + permanent.count }
}

struct LivePID: Identifiable {
    let id: String
    let name: String
    let unit: String
    var value: String = "—"
}
