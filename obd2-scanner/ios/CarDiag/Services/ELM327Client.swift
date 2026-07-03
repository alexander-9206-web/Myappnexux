import Foundation
import Network

@MainActor
final class ELM327Client: ObservableObject {
    @Published var isConnected = false
    @Published var isBusy = false
    @Published var statusMessage = "Desconectado"
    @Published var adapterInfo = ""
    @Published var protocolName = ""
    @Published var vin = ""
    @Published var scanResults: [ModuleScanResult] = []
    @Published var livePIDs: [LivePID] = [
        LivePID(id: "0C", name: "RPM", unit: "rpm"),
        LivePID(id: "0D", name: "Velocidad", unit: "km/h"),
        LivePID(id: "05", name: "Temp. motor", unit: "°C"),
        LivePID(id: "11", name: "Acelerador", unit: "%"),
        LivePID(id: "42", name: "Voltaje", unit: "V")
    ]

    var host = "192.168.0.10"
    var port: UInt16 = 35000

    private var connection: NWConnection?
    private var buffer = ""
    private var liveTask: Task<Void, Never>?

    func connect() async {
        disconnect()
        isBusy = true
        statusMessage = "Conectando…"

        let conn = NWConnection(
            host: NWEndpoint.Host(host),
            port: NWEndpoint.Port(rawValue: port)!,
            using: .tcp
        )
        connection = conn

        conn.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                guard let self else { return }
                switch state {
                case .ready:
                    self.isConnected = true
                    self.statusMessage = "Conectado"
                    self.isBusy = false
                    Task { await self.initialize() }
                case .failed(let err):
                    self.isConnected = false
                    self.statusMessage = err.localizedDescription
                    self.isBusy = false
                case .cancelled:
                    self.isConnected = false
                    self.statusMessage = "Desconectado"
                    self.isBusy = false
                default: break
                }
            }
        }

        conn.start(queue: .global(qos: .userInitiated))
    }

    func disconnect() {
        liveTask?.cancel()
        liveTask = nil
        connection?.cancel()
        connection = nil
        isConnected = false
        scanResults = []
        statusMessage = "Desconectado"
    }

    private func initialize() async {
        isBusy = true
        let steps = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"]
        for cmd in steps {
            _ = try? await send(cmd, timeout: cmd == "ATZ" ? 5 : 2)
            try? await Task.sleep(nanoseconds: 120_000_000)
        }
        if let info = try? await send("ATI", timeout: 2) {
            adapterInfo = info.components(separatedBy: .newlines).first ?? info
        }
        if let proto = try? await send("ATDPN", timeout: 3) {
            protocolName = proto.components(separatedBy: .newlines).last ?? proto
        }
        isBusy = false
    }

    func scanAllModules() async {
        guard isConnected else { return }
        isBusy = true
        scanResults = []
        statusMessage = "Escaneando módulos…"

        for (index, mod) in ECUModule.all.enumerated() {
            statusMessage = "Escaneando \(mod.shortName) (\(index + 1)/\(ECUModule.all.count))"
            var result = ModuleScanResult(id: mod.id, module: mod)
            do {
                result.stored = try await readDTCs(module: mod, mode: .stored)
                result.pending = try await readDTCs(module: mod, mode: .pending)
                result.permanent = (try? await readDTCs(module: mod, mode: .permanent)) ?? []
            } catch {
                result.error = error.localizedDescription
            }
            scanResults.append(result)
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        isBusy = false
        let total = scanResults.reduce(0) { $0 + $1.totalCount }
        statusMessage = total > 0 ? "\(total) código(s) detectados" : "Sin códigos — vehículo OK"
    }

    func readDTCs(module: ECUModule, mode: DTCMode) async throws -> [DiagnosticCode] {
        try await setHeader(module.header)
        let resp = try await send(mode.rawValue, timeout: 8)
        try await resetHeader()
        return DTCParser.parse(resp, mode: mode)
    }

    func clearModule(_ module: ECUModule) async throws {
        try await setHeader(module.header)
        _ = try await send("04", timeout: 5)
        try await resetHeader()
        if let idx = scanResults.firstIndex(where: { $0.id == module.id }) {
            scanResults[idx].stored = []
            scanResults[idx].pending = []
            scanResults[idx].permanent = []
        }
    }

    func readVIN() async {
        guard isConnected else { return }
        isBusy = true
        if let resp = try? await send("0902", timeout: 10) {
            vin = parseVIN(resp) ?? "No disponible"
        }
        isBusy = false
    }

    func startLiveData() {
        liveTask?.cancel()
        liveTask = Task {
            while !Task.isCancelled && isConnected {
                for i in livePIDs.indices {
                    if Task.isCancelled { return }
                    if let val = try? await readPID(livePIDs[i].id) {
                        livePIDs[i].value = val
                    }
                }
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
        }
    }

    func stopLiveData() {
        liveTask?.cancel()
        liveTask = nil
    }

    private var tachTask: Task<Void, Never>?

    func startTachometer(onUpdate: @escaping (Double) -> Void) {
        tachTask?.cancel()
        tachTask = Task {
            while !Task.isCancelled && isConnected {
                if let rpm = try? await readRPM() {
                    onUpdate(rpm)
                }
                try? await Task.sleep(nanoseconds: 120_000_000)
            }
        }
    }

    func stopTachometer() {
        tachTask?.cancel()
        tachTask = nil
    }

    func readRPM() async throws -> Double {
        let resp = try await send("010C", timeout: 4)
        let hex = resp.uppercased().filter { "0123456789ABCDEF".contains($0) }
        guard let range = hex.range(of: "410C"), hex.distance(from: range.upperBound, to: hex.endIndex) >= 4 else {
            throw URLError(.cannotParseResponse)
        }
        let data = hex[range.upperBound...]
        let b0 = Int(data.prefix(2), radix: 16) ?? 0
        let b1 = Int(data.dropFirst(2).prefix(2), radix: 16) ?? 0
        return Double(b0 * 256 + b1) / 4.0
    }

    struct OdometerReading {
        let km: Double
        let source: String
    }

    func readOdometer() async -> OdometerReading? {
        if let km = try? await readOdometerPID() {
            return OdometerReading(km: km, source: "PID 01A6 (OBD)")
        }
        let udsAttempts: [(String, String, String)] = [
            ("720", "F190", "UDS F190 (Tablero IC)"),
            ("720", "DD01", "UDS DD01 (Tablero)"),
            ("720", "B012", "UDS B012 (Tablero)"),
            ("7E0", "F190", "UDS F190 (ECM)")
        ]
        for (header, did, label) in udsAttempts {
            if let km = try? await readOdometerUDS(header: header, did: did) {
                return OdometerReading(km: km, source: label)
            }
        }
        return nil
    }

    func writeOdometer(km: Double, did: String) async throws {
        let didClean = did.uppercased().filter { "0123456789ABCDEF".contains($0) }
        let tenths = Int(km * 10)
        let bytes = String(format: "%02X%02X%02X", (tenths >> 16) & 0xFF, (tenths >> 8) & 0xFF, tenths & 0xFF)
        try await setHeader("720")
        let resp = try await send("2E\(didClean)\(bytes)", timeout: 10)
        try await resetHeader()
        if resp.uppercased().contains("NO DATA") || resp.uppercased().contains("ERROR") {
            throw URLError(.cannotWriteToFile)
        }
    }

    private func readOdometerPID() async throws -> Double {
        let resp = try await send("01A6", timeout: 4)
        let hex = resp.uppercased().filter { "0123456789ABCDEF".contains($0) }
        guard let range = hex.range(of: "41A6"), hex.distance(from: range.upperBound, to: hex.endIndex) >= 6 else {
            throw URLError(.cannotParseResponse)
        }
        let data = hex[range.upperBound...]
        let b0 = Int(data.prefix(2), radix: 16) ?? 0
        let b1 = Int(data.dropFirst(2).prefix(2), radix: 16) ?? 0
        let b2 = Int(data.dropFirst(4).prefix(2), radix: 16) ?? 0
        return Double(b0 * 65536 + b1 * 256 + b2) / 10.0
    }

    private func readOdometerUDS(header: String, did: String) async throws -> Double {
        try await setHeader(header)
        let resp = try await send("22\(did)", timeout: 6)
        try await resetHeader()
        let hex = resp.uppercased().filter { "0123456789ABCDEF".contains($0) }
        let marker = "62\(did.uppercased())"
        guard let range = hex.range(of: marker), hex.distance(from: range.upperBound, to: hex.endIndex) >= 6 else {
            throw URLError(.cannotParseResponse)
        }
        let data = hex[range.upperBound...]
        let b0 = Int(data.prefix(2), radix: 16) ?? 0
        let b1 = Int(data.dropFirst(2).prefix(2), radix: 16) ?? 0
        let b2 = Int(data.dropFirst(4).prefix(2), radix: 16) ?? 0
        if did.uppercased() == "F190" || did.uppercased() == "DD01" {
            return Double(b0 * 65536 + b1 * 256 + b2) / 10.0
        }
        return Double(b0 * 65536 + b1 * 256 + b2)
    }

    private func readPID(_ pid: String) async throws -> String {
        let resp = try await send("01\(pid)", timeout: 4)
        return formatPID(resp, pid: pid) ?? "—"
    }

    private func setHeader(_ header: String) async throws {
        _ = try await send("AT SH \(header)", timeout: 2)
    }

    private func resetHeader() async throws {
        _ = try await send("AT AR", timeout: 2)
    }

    private func send(_ cmd: String, timeout: TimeInterval) async throws -> String {
        guard let connection else { throw URLError(.notConnectedToInternet) }
        buffer = ""
        let payload = (cmd + "\r").data(using: .utf8)!
        connection.send(content: payload, completion: .contentProcessed { _ in })

        return try await withThrowingTaskGroup(of: String.self) { group in
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw URLError(.timedOut)
            }
            group.addTask { [self] in
                while true {
                    let chunk = try await self.readChunk()
                    self.buffer += chunk
                    if let range = self.buffer.range(of: ">") {
                        let raw = String(self.buffer[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                        self.buffer = String(self.buffer[range.upperBound...])
                        return raw.replacingOccurrences(of: "\r", with: "\n")
                    }
                    try await Task.sleep(nanoseconds: 30_000_000)
                }
            }
            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }

    private func readChunk() async throws -> String {
        try await withCheckedThrowingContinuation { cont in
            connection?.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, err in
                if let err { cont.resume(throwing: err); return }
                let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                cont.resume(returning: text)
            }
        }
    }

    private func formatPID(_ raw: String, pid: String) -> String? {
        let hex = raw.uppercased().filter { "0123456789ABCDEF".contains($0) }
        let marker = "41\(pid.uppercased())"
        guard let range = hex.range(of: marker) else { return nil }
        let data = String(hex[range.upperBound...])
        guard data.count >= 2 else { return nil }
        let b0 = Int(data.prefix(2), radix: 16) ?? 0

        switch pid.uppercased() {
        case "0C":
            guard data.count >= 4 else { return nil }
            let b1 = Int(data.dropFirst(2).prefix(2), radix: 16) ?? 0
            return String(format: "%.0f", Double(b0 * 256 + b1) / 4.0)
        case "0D": return "\(b0)"
        case "05": return "\(b0 - 40)"
        case "11": return String(format: "%.0f", Double(b0) * 100.0 / 255.0)
        case "42":
            guard data.count >= 4 else { return nil }
            let b1 = Int(data.dropFirst(2).prefix(2), radix: 16) ?? 0
            return String(format: "%.1f", Double(b0 * 256 + b1) / 1000.0)
        default: return "\(b0)"
        }
    }

    private func parseVIN(_ raw: String) -> String? {
        let hex = raw.uppercased().filter { "0123456789ABCDEF".contains($0) }
        guard let range = hex.range(of: "4902") else { return nil }
        var data = String(hex[range.upperBound...].dropFirst(2))
        var vin = ""
        while data.count >= 2 && vin.count < 17 {
            let byte = Int(data.prefix(2), radix: 16) ?? 0
            data = String(data.dropFirst(2))
            if byte >= 32 && byte <= 126, let scalar = UnicodeScalar(byte) {
                vin.append(Character(scalar))
            }
        }
        return vin.count >= 11 ? vin : nil
    }
}
