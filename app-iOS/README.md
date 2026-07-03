# CarDiag — Proyecto Xcode iOS

App nativa lista para abrir en **Xcode 15+** y ejecutar en tu iPhone.

## Abrir el proyecto

```bash
open app-iOS/CarDiag.xcodeproj
```

O en Finder: doble clic en `CarDiag.xcodeproj`.

## Ejecutar en tu iPhone

1. Conecta el iPhone al Mac con cable USB (o WiFi debugging).
2. En Xcode, selecciona tu iPhone en la barra superior (junto al botón ▶).
3. Ve a **CarDiag** (target) → **Signing & Capabilities**.
4. Marca **Automatically manage signing**.
5. Elige tu **Team** (Apple ID gratuito o cuenta desarrollador).
6. Si Xcode pide cambiar el Bundle ID, usa uno único, por ejemplo: `com.tunombre.cardiag`.
7. Pulsa **▶ Run** (Cmd+R).

### Primera vez en el iPhone

- Ajustes → General → VPN y gestión de dispositivos → confiar en tu certificado de desarrollador.

## Uso con adaptador OBD2 WiFi

1. Enciende el **contacto** del vehículo.
2. Conecta el dongle ELM327/MY327 WiFi al puerto OBD2.
3. En el iPhone: **Ajustes → WiFi** → conéctate a la red del adaptador.
4. Abre **CarDiag** → pestaña **Conectar**.
5. IP por defecto: `192.168.0.10` · Puerto: `35000`.
6. Pulsa **Conectar** → **Módulos → Escanear todos**.

## Estructura

```
app-iOS/
├── CarDiag.xcodeproj/     ← Abrir esto en Xcode
└── CarDiag/
    ├── CarDiagApp.swift
    ├── Models/
    ├── Services/
    ├── Views/
    ├── Assets.xcassets/
    └── Info.plist
```

## Requisitos

- macOS con Xcode 15 o superior
- iOS 16+ en el iPhone
- Adaptador OBD2 **WiFi** (MY327 WiFi, ELM327 WiFi)

## Nota sobre MY327 Bluetooth

El MY327 **Bluetooth Classic** no funciona directamente en iOS. Usa la versión **WiFi** del adaptador o un dongle ELM327 WiFi.

## Icono de la app

Sustituye `CarDiag/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` por tu icono 1024×1024 px.
