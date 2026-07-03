# CarDiag — App iOS nativa

Abrir en Xcode 15+:

1. **File → New → Project → iOS App**
2. Product Name: `CarDiag`, Interface: **SwiftUI**, Language: **Swift**
3. Sustituir los archivos generados por los de `ios/CarDiag/`
4. Añadir al target todos los `.swift` y `Info.plist`
5. En **Signing & Capabilities**, activar tu Team de desarrollo
6. Conectar iPhone → Run

## Conexión MY327 / ELM327 WiFi

1. Enciende el contacto del vehículo
2. Conecta el dongle al puerto OBD2
3. En iPhone: **Ajustes → WiFi → red del adaptador** (ej. `OBDII`, `WiFi_OBD`)
4. En la app: IP `192.168.0.10`, puerto `35000` → **Conectar**
5. Pestaña **Módulos → Escanear todos**

## Módulos soportados (14 ECU)

ECM, TCM, ABS, SRS, BCM, HVAC, TPMS, EPS, IC, Gateway, SKIM, BMS, PAM, Radio

Cada módulo lee códigos **almacenados**, **pendientes** y **permanentes** vía headers CAN (`AT SH`).

## MY327 Bluetooth Classic

iOS no permite BT Classic desde apps sin certificación MFi. Opciones:

- Usar versión **WiFi** del MY327 (recomendado)
- Usar la PWA + puente WebSocket en Mac/PC
