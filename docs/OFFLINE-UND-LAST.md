# Offlinebetrieb und Anfragelast

Stand 26. November 2026.

| Bereich | Aktueller Stand |
| --- | --- |
| Lesen | TanStack Query hält getrennte Kontocaches im RAM. Frische Daten werden 30 Sekunden wiederverwendet. Inaktive Abfragen können nach fünf Minuten entfernt werden. Zwei Beobachter derselben laufenden Abfrage teilen die Anfrage. |
| Aktualisieren | Änderungen werden aus bestätigten Serverantworten übernommen. Eine Notiz markiert das Objektdetail als veraltet, eine Kategorie ihren Typ. Objektänderungen markieren die Listen; aktive Listen werden nach einem Warteschlangendurchlauf einmal aktualisiert. Ältere Revisionen können den Cache nicht zurücksetzen. |
| Schreiben | Klick auf Speichern schreibt den vollständigen Auftrag mit unveränderter UUID zuerst nach IndexedDB. Erst der Transaktionsabschluss erlaubt die Anzeige „Lokal gespeichert“. Die Serverbestätigung räumt den Auftrag aus der sichtbaren Warteschlange. Maximal 50 offene oder abgewiesene Aufträge je Konto. |
| Wiederanlauf | Die geöffnete App synchronisiert beim Start, bei Rückkehr in den Vordergrund, bei erneuter Verbindung und über „Jetzt prüfen“. Verarbeitung erfolgt nacheinander. Web Locks koordiniert verfügbare Browser-Tabs. Gleiche UUID und Nutzlast sichern den Server auch bei wiederholter Ausführung ab. |
| Fehler | Nach unklarem Resultat pausiert die Reihenfolge. Wartezeiten wachsen zwischen 2 Sekunden und 2 Minuten. Erneute Ereignisse vor Ablauf senden nichts. Fehlgeschlagene oder konfliktbehaftete Aufträge bleiben im Einstellungsfenster zur Prüfung und zum Export. Formulare zeigen bei offenem Editor die bisherige Konfliktauflösung. |
| Anfragelast | Kein Polling, keine automatische Wiederholung der Lesefehler, 12 Sekunden Client-Zeitlimit pro RPC. Der SDK-Quellcode bestätigt, dass seine eigene Wiederholung nur idempotente HTTP-Methoden umfasst. Der Inventarclient ruft POST-RPC auf und legt die Retry-Entscheidung explizit bei der Warteschlange fest. |
| Datenbank | Der Dispatcher prüft Eigentümer und Befehlsargumente. Suche hat maximal 50 Ergebnisse pro Seite. Revisionen und eindeutige Auftrags-IDs sichern Schreibvorgänge ab. Ein Limit von 256 KiB gilt für die Argumente des SQL-Befehls. Die Kategoriezuordnung hat einen Index auf Eigentümer und Kategorie. Client-Zeitlimits allein setzen kein serverseitiges Abfragelimit. |

Ein lokal gespeicherter Auftrag ist nicht dasselbe wie ein lokaler Inventarbestand. Die App-Hülle, geöffnete Objektansichten und ungespeicherte Formulare werden bisher nicht über ein vollständiges Offline-Neuladen hinweg wiederhergestellt. Fotos haben noch keine Offline-Ablage. Eine nach App-Abbruch erhaltene Warteschlange wird beim nächsten Start mit passendem Konto und erneuter Verbindung verarbeitet.

## Nächste Schritte und Gegenprobe

1. **Offline öffnen und lesen.** Versionierte App-Hülle im Service Worker cachen. Einen kleinen bestätigten Bestand pro Konto lokal speichern. Erstmals offline geöffnete App, abgelaufene Sitzung, Konto A → B und Versionswechsel im Flugmodus prüfen. Private API-Antworten nicht pauschal in den originweiten HTTP-Cache übernehmen. Ein langlebiger React-Query-Cache allein würde die App beim Offline-Start nicht laden.
2. **Warteschlange auf echten Geräten abnehmen.** Auftrag offline speichern, Safari schließen, erneut öffnen und erst dann verbinden. Parallel zwei Tabs, verlorene Serverantwort und abgelaufene Anmeldung prüfen. WebKit-Speicher kann unter Speicherknappheit entfernt werden. Browser-Persistenz und späterer Export gehören deshalb zur Abnahme. Background Sync ist nicht überall verfügbar und bietet keine belastbare Zusage für eine geschlossene iPhone-App.
3. **Serverlast messen.** Bei wachsendem Bestand Zeit und Anzahl der RPC-Aufrufe pro Start, Suche und Sync erfassen. Den SQL-Plan für die Teilstringsuche mit realistischen Daten prüfen. Der Fremdschlüsselindex hilft der Kategoriebeziehung. Die Textsuche profitiert davon nicht automatisch. Bei belegtem Scan-Problem Trigrammindex oder eine entsprechend zugeschnittene Suche bewerten.
4. **Bei Überschreitung der gemessenen Last Budgets ergänzen.** Ein Limit ausschließlich an der MCP Edge Function würde die vom Browser direkt aufgerufene Data API nicht schützen. Für harte Grenzen die gemeinsame RPC-Grenze oder alle erreichbaren Routen betrachten, nach Konto und Befehl messen und Datenbank-Timeouts auf den tatsächlichen Pfad begrenzen. Ein globaler Zähler pro Request erzeugt selbst zusätzliche Schreiblast.
5. **Fotos separat behandeln.** Dateispeicher und ein wiederaufnehmbarer Upload bekommen einen eigenen Status. Die Textwarteschlange trägt keine Bilddaten. Ein Upload wird erst nach Bestätigung von Datei und Metadaten als abgeschlossen angezeigt.

## Quellen

- [WebKit, Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [MDN, Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [TanStack Query, Caching Examples](https://tanstack.com/query/latest/docs/framework/react/guides/caching)
- [Supabase, Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
