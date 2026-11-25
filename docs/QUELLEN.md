# Technische Quellen

Recherche und Abruf am 26. November 2026. Preise, Feature-Reifegrade und Browserunterstützung werden vor Implementierung und Tarifbuchung erneut mit der gewählten Version geprüft. Entscheidungen und projektspezifische Testanforderungen stehen in ARCHITEKTUR.md und ABNAHME.md.

| Kennung | Primärquelle | Belegthema |
| --- | --- | --- |
| S1 | [Supabase Pricing](https://supabase.com/pricing) und [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) | Pro ab 25 USD, Free-Speicher und Pausen |
| S2 | [PowerSync Pricing](https://powersync.com/pricing) | Pro ab 49 USD und Free-Inaktivität |
| S3 | [PowerSync Web-SDK](https://docs.powersync.com/client-sdks/reference/javascript-web) und [Feature Status](https://docs.powersync.com/resources/feature-status) | Lokales SQLite, Connector, React und Reifegrade |
| S4 | [PowerSync Attachments / Files](https://docs.powersync.com/client-sdks/advanced/attachments.md) | Getrennte Metadaten und Dateispeicher, Alpha-Dateihelfer |
| S5 | [PowerSync Handling Update Conflicts](https://docs.powersync.com/handling-writes/handling-update-conflicts.md) | Schreibwarteschlange und Backend-Konfliktregel |
| S6 | [Dexie Cloud Pricing](https://dexie.org/pricing) | Sitzpakete, Gratisgrenzen und Speicher |
| S7 | [Dexie Blob Offloading](https://dexie.org/docs/cloud/blob-offloading) | Versionsanforderungen und Canary-Hinweis |
| S8 | [Dexie Cloud Consistency](https://dexie.org/docs/cloud/consistency) und [SQLite Appropriate Uses](https://www.sqlite.org/whentouse.html) | Alternative Synchronisation und SQLite-Serverbetrieb |
| S9 | [Supabase Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) | Tus-Uploads und Uppy-Integration |
| S10 | [Uppy Tus](https://uppy.io/docs/tus/) | Wiederaufnehmbare Transfers |
| S11 | [Vite](https://vite.dev/guide/) und [Vite PWA](https://vite-pwa-org.netlify.app/guide/) | Build, Manifest und Service Worker |
| S12 | [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) | Fokus, Tastatur und anpassbare Komponenten |
| S13 | [React Hook Form](https://react-hook-form.com/get-started) und [Zod-Integration](https://react-hook-form.com/integrations/zod) | Formulare und Schemavalidierung |
| S14 | [PhotoSwipe React](https://photoswipe.com/react-image-gallery/) | Einbindung der Bildgalerie |
| S15 | [Playwright Emulation](https://playwright.dev/docs/emulation) | Browser-, Geräte- und Offlineemulation |
| S16 | [WebKit Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/) | Quoten, Eviction und Persistenzanfragen |
| S17 | [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) | Eingeschränkte Verfügbarkeit |
| S18 | [Supabase Bucket Fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) und [PowerSync Supabase-Integration](https://docs.powersync.com/integrations/supabase/guide.md) | Private Dateien, Schreibrechte und Sync-Filter |
| S19 | [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) | Umfang von Datenbankbackups |
| S20 | [Sharp Output Options](https://sharp.pixelplumbing.com/api-output/) | HEIC und HEVC benötigen passende Decoder |
| S21 | [OpenAI AGENTS.md](https://developers.openai.com/codex/guides/agents-md) | Gestufte Projektanweisungen |
| S22 | [Uppy Golden Retriever](https://uppy.io/docs/golden-retriever/) | Lokale Wiederherstellung und standardmäßige Dateigrenze |

Das Vorliegen einer Dokumentation belegt eine dokumentierte Fähigkeit oder Grenze. Der Nachweis der Eignung für diese Sammlung erfolgt zusätzlich anhand der Abnahmetests.
