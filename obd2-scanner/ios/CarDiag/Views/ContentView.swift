import SwiftUI

struct ContentView: View {
    @StateObject private var obd = ELM327Client()
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            ConnectView()
                .tabItem { Label("Conectar", systemImage: "antenna.radiowaves.left.and.right") }
                .tag(0)

            ModulesView()
                .tabItem { Label("Módulos", systemImage: "square.grid.2x2") }
                .tag(1)

            TachometerView()
                .tabItem { Label("Tacómetro", systemImage: "gauge.with.needle") }
                .tag(2)

            LiveDataView()
                .tabItem { Label("En vivo", systemImage: "gauge.with.dots.needle.67percent") }
                .tag(3)

            VehicleView()
                .tabItem { Label("Vehículo", systemImage: "car") }
                .tag(4)
        }
        .environmentObject(obd)
        .tint(Color.cyan)
    }
}

struct ConnectView: View {
    @EnvironmentObject var obd: ELM327Client

    var body: some View {
        NavigationStack {
            Form {
                Section("Adaptador WiFi ELM327 / MY327") {
                    TextField("IP del dongle", text: $obd.host)
                        .keyboardType(.decimalPad)
                        .textInputAutocapitalization(.never)
                    Stepper("Puerto: \(obd.port)", value: Binding(
                        get: { Int(obd.port) },
                        set: { obd.port = UInt16($0) }
                    ), in: 1...65535)
                    Text("Conecta el iPhone al WiFi del adaptador OBD2 antes de conectar.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    if obd.isConnected {
                        Label(obd.statusMessage, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        if !obd.adapterInfo.isEmpty {
                            LabeledContent("Adaptador", value: obd.adapterInfo)
                        }
                        Button("Desconectar", role: .destructive) {
                            obd.disconnect()
                        }
                    } else {
                        Button {
                            Task { await obd.connect() }
                        } label: {
                            if obd.isBusy {
                                ProgressView()
                            } else {
                                Text("Conectar")
                            }
                        }
                        .disabled(obd.isBusy)
                    }
                }

                Section("Instrucciones iOS") {
                    Text("1. Enciende el contacto del vehículo")
                    Text("2. Conecta el dongle al puerto OBD2")
                    Text("3. Une el iPhone al WiFi del adaptador")
                    Text("4. Pulsa Conectar y escanea módulos")
                }
                .font(.footnote)
            }
            .navigationTitle("CarDiag")
        }
    }
}

struct ModulesView: View {
    @EnvironmentObject var obd: ELM327Client

    var body: some View {
        NavigationStack {
            Group {
                if obd.scanResults.isEmpty {
                    ContentUnavailableView(
                        "Sin escaneo",
                        systemImage: "square.grid.2x2",
                        description: Text("Conecta el adaptador y pulsa Escanear todos")
                    )
                } else {
                    List(obd.scanResults) { result in
                        NavigationLink(value: result) {
                            ModuleRow(result: result)
                        }
                    }
                }
            }
            .navigationTitle("Módulos ECU")
            .navigationDestination(for: ModuleScanResult.self) { result in
                ModuleDetailView(result: result)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Escanear todos") {
                        Task { await obd.scanAllModules() }
                    }
                    .disabled(!obd.isConnected || obd.isBusy)
                }
            }
            .overlay {
                if obd.isBusy {
                    ProgressView(obd.statusMessage)
                        .padding()
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}

struct ModuleRow: View {
    let result: ModuleScanResult

    var body: some View {
        HStack(spacing: 12) {
            Text(result.module.icon).font(.title2)
            VStack(alignment: .leading, spacing: 2) {
                Text(result.module.name).font(.headline)
                Text("\(result.module.shortName) · CAN \(result.module.header)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if result.totalCount > 0 {
                Text("\(result.totalCount) DTC")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.orange.opacity(0.2))
                    .clipShape(Capsule())
            } else if result.error != nil {
                Text("N/A").font(.caption).foregroundStyle(.secondary)
            } else {
                Text("OK")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.green.opacity(0.2))
                    .clipShape(Capsule())
            }
        }
    }
}

struct ModuleDetailView: View {
    @EnvironmentObject var obd: ELM327Client
    let result: ModuleScanResult
    @State private var clearing = false

    var body: some View {
        List {
            Section(result.module.name) {
                LabeledContent("TX", value: result.module.header)
                LabeledContent("RX", value: result.module.rx)
            }

            if let error = result.error, result.totalCount == 0 {
                Section {
                    Text(error).foregroundStyle(.secondary)
                }
            }

            if !result.stored.isEmpty {
                Section("Almacenados") {
                    ForEach(result.stored) { dtc in
                        DTCRow(dtc: dtc)
                    }
                }
            }
            if !result.pending.isEmpty {
                Section("Pendientes") {
                    ForEach(result.pending) { dtc in
                        DTCRow(dtc: dtc)
                    }
                }
            }
            if !result.permanent.isEmpty {
                Section("Permanentes") {
                    ForEach(result.permanent) { dtc in
                        DTCRow(dtc: dtc)
                    }
                }
            }
            if result.totalCount == 0 && result.error == nil {
                Section {
                    Label("Sin códigos en este módulo", systemImage: "checkmark.circle")
                        .foregroundStyle(.green)
                }
            }

            Section {
                Button("Borrar códigos del módulo", role: .destructive) {
                    clearing = true
                    Task {
                        try? await obd.clearModule(result.module)
                        clearing = false
                    }
                }
                .disabled(clearing || !obd.isConnected)
            }
        }
        .navigationTitle(result.module.shortName)
    }
}

struct DTCRow: View {
    let dtc: DiagnosticCode

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(dtc.code).font(.system(.body, design: .monospaced)).bold()
            Text(dtc.description).font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

struct LiveDataView: View {
    @EnvironmentObject var obd: ELM327Client
    @State private var running = false

    var body: some View {
        NavigationStack {
            List(obd.livePIDs) { pid in
                HStack {
                    Text(pid.name)
                    Spacer()
                    Text(pid.value)
                        .font(.system(.title3, design: .rounded).bold())
                    Text(pid.unit)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Datos en vivo")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(running ? "Detener" : "Iniciar") {
                        running.toggle()
                        if running { obd.startLiveData() } else { obd.stopLiveData() }
                    }
                    .disabled(!obd.isConnected)
                }
            }
        }
    }
}

struct VehicleView: View {
    @EnvironmentObject var obd: ELM327Client

    var body: some View {
        NavigationStack {
            Form {
                Section("Identificación") {
                    LabeledContent("VIN", value: obd.vin.isEmpty ? "—" : obd.vin)
                    LabeledContent("Protocolo", value: obd.protocolName.isEmpty ? "—" : obd.protocolName)
                    LabeledContent("Adaptador", value: obd.adapterInfo.isEmpty ? "—" : obd.adapterInfo)
                    Button("Leer VIN") {
                        Task { await obd.readVIN() }
                    }
                    .disabled(!obd.isConnected || obd.isBusy)
                }
                Section("Cobertura") {
                    LabeledContent("Módulos ECU", value: "\(ECUModule.all.count)")
                    Text("Motor, transmisión, ABS, airbag, BCM, HVAC, TPMS, dirección, tablero, gateway, inmovilizador, híbrido, estacionamiento y multimedia.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Vehículo")
        }
    }
}

#Preview {
    ContentView()
}
