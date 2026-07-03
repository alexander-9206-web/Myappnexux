import SwiftUI

struct TachometerConfig: Codable, Equatable {
    var maxRpm: Double = 8000
    var redlineRpm: Double = 6500
    var warnRpm: Double = 5500
    var calibration: Double = 0
    var theme: String = "sport"

    static let storageKey = "cardiag_tacho_config"

    static func load() -> TachometerConfig {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let cfg = try? JSONDecoder().decode(TachometerConfig.self, from: data) else {
            return TachometerConfig()
        }
        return cfg
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }
}

struct TachometerView: View {
    @EnvironmentObject var obd: ELM327Client
    @State private var config = TachometerConfig.load()
    @State private var rpm: Double = 0
    @State private var running = false
    @State private var showEditor = false
    @State private var odometerKm: String = "—"
    @State private var odometerInput = ""
    @State private var odometerSource = ""
    @State private var selectedDID = "F190"
    @State private var workshopMode = true
    @State private var workOrder = ""
    @State private var workshopLog = ""
    @State private var showWriteAlert = false

    private let didOptions = ["F190", "DD01", "B012"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    TachometerGauge(rpm: rpm, config: config)
                        .frame(height: 260)
                        .padding(.top, 8)

                    HStack {
                        Text(running ? "Lectura activa" : "Detenido")
                            .foregroundStyle(running ? .green : .secondary)
                        Spacer()
                        Text("Max \(Int(config.maxRpm)) · Redline \(Int(config.redlineRpm))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)

                    HStack(spacing: 10) {
                        Button(running ? "Detener" : "Iniciar") {
                            running.toggle()
                            if running { startPolling() } else { obd.stopTachometer() }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!obd.isConnected)

                        Button("Editar") { showEditor = true }
                            .buttonStyle(.bordered)
                    }
                    .padding(.horizontal)

                    GroupBox("Odómetro — Tablero IC") {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(odometerKm)
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                            if !odometerSource.isEmpty {
                                Text(odometerSource).font(.caption).foregroundStyle(.secondary)
                            }
                            TextField("Kilometraje (km)", text: $odometerInput)
                                .keyboardType(.numberPad)
                            Picker("DID", selection: $selectedDID) {
                                ForEach(didOptions, id: \.self) { did in
                                    Text("DID \(did)").tag(did)
                                }
                            }
                            HStack {
                                Button("Leer") {
                                    Task {
                                        if let r = await obd.readOdometer() {
                                            odometerKm = String(format: "%.0f km", r.km)
                                            odometerInput = String(format: "%.0f", r.km)
                                            odometerSource = r.source
                                        } else {
                                            odometerKm = "No disponible"
                                        }
                                    }
                                }
                                .disabled(!obd.isConnected)

                                Button("Escribir", role: .destructive) {
                                    showWriteAlert = true
                                }
                                .disabled(!obd.isConnected || odometerInput.isEmpty)
                            }
                            Text("Desbloqueo UDS ISO 14229 para recalibración con orden del cliente.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Toggle("Modo taller — Security Access UDS", isOn: $workshopMode)
                            TextField("Orden de trabajo / cliente", text: $workOrder)
                            if !workshopLog.isEmpty {
                                Text(workshopLog)
                                    .font(.system(.caption2, design: .monospaced))
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .navigationTitle("Tacómetro")
            .sheet(isPresented: $showEditor) {
                TachometerEditorView(config: $config) {
                    config.save()
                    showEditor = false
                }
            }
            .alert("Confirmar escritura", isPresented: $showWriteAlert) {
                Button("Cancelar", role: .cancel) {}
                Button("Escribir", role: .destructive) {
                    Task {
                        if let km = Double(odometerInput) {
                            do {
                                let log = try await obd.writeOdometer(km: km, did: selectedDID, workshopUnlock: workshopMode)
                                workshopLog = log.joined(separator: "\n")
                                if !workOrder.isEmpty { workshopLog += "\nOrden: \(workOrder)" }
                                odometerKm = String(format: "%.0f km", km)
                            } catch {
                                workshopLog = "ERROR: \(error.localizedDescription)"
                            }
                        }
                    }
                }
            } message: {
                Text("Security Access UDS + escritura \(odometerInput) km (DID \(selectedDID)).\(workOrder.isEmpty ? "" : "\nOrden: \(workOrder)")")
            }
            .onDisappear {
                running = false
                obd.stopTachometer()
            }
        }
    }

    private func startPolling() {
        obd.startTachometer { value in
            rpm = max(0, value + config.calibration)
        }
    }
}

struct TachometerGauge: View {
    let rpm: Double
    let config: TachometerConfig

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0.125, to: 0.875)
                .stroke(Color.white.opacity(0.08), style: StrokeStyle(lineWidth: 16, lineCap: .round))
                .rotationEffect(.degrees(90))

            Circle()
                .trim(from: 0.125, to: 0.125 + 0.75 * min(1, rpm / config.maxRpm))
                .stroke(
                    rpm >= config.redlineRpm ? Color.red :
                        rpm >= config.warnRpm ? Color.cyan : Color.green,
                    style: StrokeStyle(lineWidth: 16, lineCap: .round)
                )
                .rotationEffect(.degrees(90))
                .animation(.easeOut(duration: 0.15), value: rpm)

            VStack(spacing: 2) {
                Text("\(Int(rpm))")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundStyle(rpm >= config.redlineRpm ? .red : .primary)
                Text("RPM")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(24)
    }
}

struct TachometerEditorView: View {
    @Binding var config: TachometerConfig
    var onSave: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Escala") {
                    Stepper("RPM máximo: \(Int(config.maxRpm))", value: $config.maxRpm, in: 4000...10000, step: 500)
                    Stepper("Redline: \(Int(config.redlineRpm))", value: $config.redlineRpm, in: 3000...9000, step: 100)
                    Stepper("Advertencia: \(Int(config.warnRpm))", value: $config.warnRpm, in: 2000...8000, step: 100)
                    Stepper("Calibración: \(Int(config.calibration))", value: $config.calibration, in: -500...500, step: 10)
                }
                Section("Tema") {
                    Picker("Estilo", selection: $config.theme) {
                        Text("Sport").tag("sport")
                        Text("Classic").tag("classic")
                        Text("Neon").tag("neon")
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Editar tacómetro")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        onSave()
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    TachometerView()
        .environmentObject(ELM327Client())
}
