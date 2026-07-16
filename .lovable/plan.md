# Migración a app nativa con Capacitor + FCM/APNs

Objetivo: publicar Hey Hey como app nativa iOS y Android con **push garantizado en background y app cerrada**, manteniendo el mismo código React que ya tienes.

---

## Requisitos que debes tener listos ANTES

| Item | Costo | Dónde |
|---|---|---|
| Cuenta Apple Developer | 99 USD/año | developer.apple.com |
| Google Play Console | 25 USD (único) | play.google.com/console |
| Proyecto Firebase (para FCM) | Gratis | console.firebase.google.com |
| Mac con Xcode (solo para iOS) | — | Requerido para compilar/firmar iOS |
| Android Studio | Gratis | Requerido para compilar/firmar Android |

> Sin Mac no se puede firmar ni subir la build de iOS. Android sí se puede desde Windows/Linux.

---

## Arquitectura después de la migración

```text
                    ┌──────────────────────────┐
                    │  Hey Hey (React + Vite)  │
                    └────────────┬─────────────┘
                                 │ Capacitor bridge
                ┌────────────────┼────────────────┐
                ▼                                 ▼
        ┌───────────────┐               ┌───────────────┐
        │   iOS nativo  │               │ Android nativo│
        │   APNs token  │               │   FCM token   │
        └───────┬───────┘               └───────┬───────┘
                └──────────────┬────────────────┘
                               ▼
           Edge Function `native-push-register`
                (guarda token por user + platform)
                               │
                               ▼
           Edge Function `send-native-push`
              (Firebase Admin SDK → FCM / APNs)
```

Web Push (VAPID) actual **se conserva** para navegadores de escritorio. Los nativos usan token FCM/APNs.

---

## Fase 1 — Preparar Capacitor en el repo

1. Ya existe `capacitor.config.ts` apuntando al preview de Lovable. Lo dejo así para desarrollo con hot reload.
2. Instalar plugin oficial de push: `@capacitor/push-notifications`.
3. Crear `src/lib/nativePush.ts` que:
   - Detecta si corre bajo Capacitor (`Capacitor.isNativePlatform()`).
   - Solicita permiso y registra el token (`PushNotifications.register()`).
   - Envía el token a la Edge Function `native-push-register` con `{ user_id, platform: 'ios' | 'android', token }`.
   - Escucha `pushNotificationReceived` (foreground) y `pushNotificationActionPerformed` (tap) para navegar a la conversación.
4. En `useWebPush.ts` / hook de inicialización: si es nativo, saltar el flujo VAPID y usar `nativePush.ts`.

## Fase 2 — Backend de tokens nativos

1. Nueva tabla `native_push_tokens (id, user_id, platform, token, device_name, last_seen_at, created_at)` con RLS: el usuario solo ve/edita los suyos; `service_role` puede todo. GRANT a `authenticated` y `service_role`.
2. Edge Function `native-push-register` (verify_jwt = false, validar `auth.getUser(token)` en código, upsert por token único).
3. Edge Function `send-native-push`:
   - Lee tokens del user.
   - Usa **Firebase Admin SDK vía HTTP v1** (una sola API para FCM y APNs — configuras APNs dentro de Firebase con la .p8 de Apple).
   - Marca tokens inválidos y los borra al recibir `UNREGISTERED` / `NOT_REGISTERED`.
4. Ajustar `whatsapp-webhook-v2` y demás disparadores para llamar además a `send-native-push` (o wrapper unificado `notify-user`).

## Fase 3 — Configuración Firebase / APNs (lo hace el usuario, guío paso a paso)

**Android (FCM):**
1. Crear proyecto Firebase → añadir app Android con package `app.lovable.06d98cdb8a334aee8f8471ecd386a16f`.
2. Descargar `google-services.json` → colocar en `android/app/`.
3. Subir la Service Account JSON de Firebase como secret `FIREBASE_SERVICE_ACCOUNT` (uso `add_secret`).

**iOS (APNs vía Firebase):**
1. En Apple Developer: crear App ID con **Push Notifications** capability, y una key `.p8` de APNs (guardar Key ID + Team ID).
2. En Firebase → añadir app iOS con el mismo bundle → subir la `.p8`, Key ID y Team ID.
3. Descargar `GoogleService-Info.plist` → colocar en `ios/App/App/`.
4. En Xcode: activar **Push Notifications** y **Background Modes → Remote notifications**.

## Fase 4 — Compilación local (usuario ejecuta)

```bash
git pull
npm install
npx cap add ios
npx cap add android
npm run build
npx cap sync
npx cap open ios      # firma con Apple Developer, envía a TestFlight
npx cap open android  # genera AAB firmado, sube a Play Console (Internal testing)
```

## Fase 5 — Publicación en stores

- **TestFlight** (iOS): review interno ~24h. Luego App Store review ~1-3 días.
- **Google Play Internal Testing**: minutos. Producción: 1-3 días.
- Ambas requieren: iconos, screenshots (3-8 por tamaño), política de privacidad (ya tienes `/privacy`), descripción, categoría.

---

## Detalles técnicos

- **Sin cambios en el frontend web actual**: los usuarios en desktop siguen recibiendo Web Push VAPID. Solo iOS/Android instalado desde stores usa FCM/APNs.
- **Hot reload en dev**: `capacitor.config.ts` ya apunta al preview de Lovable → cambios en React se ven en el simulador sin recompilar.
- **App cerrada**: FCM/APNs entregan notificaciones aunque el proceso esté muerto — este es el objetivo principal de la migración.
- **Deep link**: al tocar la notificación, `pushNotificationActionPerformed` recibe `data.conversationId` y navega a `/dashboard?conv=...` (ya soportado por tu URL state).
- **Deduplicación**: si un usuario tiene web + nativo, `notify-user` prioriza nativo cuando el token existe para ese dispositivo.

---

## Lo que hago yo en este chat

1. Instalar `@capacitor/push-notifications`.
2. Crear `src/lib/nativePush.ts` + integrar en el bootstrap del dashboard.
3. Crear migración de `native_push_tokens` con RLS + GRANT.
4. Desplegar Edge Functions `native-push-register` y `send-native-push`.
5. Añadir wrapper `notify-user` y engancharlo donde hoy se llama `send-push-notification`.
6. Guiarte para conseguir `google-services.json`, `.p8` de APNs y `GoogleService-Info.plist`, y pedirte los secrets con `add_secret` cuando estén listos.

## Lo que haces tú fuera del chat

1. Pagar Apple Developer + Play Console.
2. Crear proyecto Firebase y app iOS/Android.
3. Descargar los archivos de config y pegármelos (o subirlos como secrets).
4. Ejecutar los comandos `npx cap ...` en tu Mac / PC.
5. Subir a TestFlight y Play Console.

¿Arranco con la Fase 1 y 2 (código + backend) mientras tú abres las cuentas de developer?
