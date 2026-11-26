# Offlinebetrieb und Anfragelast

Stand 26. November 2026.

| Bereich | Aktueller Stand |
| --- | --- |
| Lesen | TanStack Query hält getrennte Kontocaches im RAM. Frische Daten werden 30 Sekunden wiederverwendet. Inaktive Abfragen können nach fünf Minuten entfernt werden. Die lokale Kopie kann diese Ansichten weiterhin bereitstellen. Zwei Beobachter derselben laufenden Abfrage teilen die Anfrage. |
| Offline-Start | Ein Service Worker speichert je Build nur öffentliche App-Dateien. Er prüft deren SHA-256-Werte beim Installieren und aktiviert nur einen vollständigen Build. Nach einmaligem Online-Start kann die Oberfläche ohne Internet geladen werden. |
| Lokale Kopie | Bestätigte Listen, geöffnete Details und Kategorien werden pro Supabase-Projekt und Konto in IndexedDB gespeichert. Grenzen sind 8 Listenansichten, 40 Details, 4 Bezeichnungstypen, 2 MiB insgesamt und sieben Tage pro Ansicht. Die Offline-Suche arbeitet über die geladenen Objektangaben. Fehlt ein Detail, zeigt die App das ausdrücklich an. |
| Aktualisieren | Änderungen werden aus bestätigten Serverantworten übernommen. Eine Notiz markiert das Objektdetail als veraltet, eine Kategorie ihren Typ. Objektänderungen markieren die Listen; aktive Listen werden nach einem Warteschlangendurchlauf einmal aktualisiert. Ältere Revisionen können den Cache nicht zurücksetzen. |
| Schreiben | Klick auf Speichern schreibt den vollständigen Auftrag mit unveränderter UUID zuerst nach IndexedDB. Erst der Transaktionsabschluss erlaubt die Anzeige „Lokal gespeichert“. Die Serverbestätigung räumt den Auftrag aus der sichtbaren Warteschlange. Maximal 50 offene oder abgewiesene Aufträge je Konto. |
| Wiederanlauf | Die geöffnete App synchronisiert beim Start, bei Rückkehr in den Vordergrund, bei erneuter Verbindung und über „Jetzt prüfen“. Verarbeitung erfolgt nacheinander. Web Locks koordiniert verfügbare Browser-Tabs. Gleiche UUID und Nutzlast sichern den Server auch bei wiederholter Ausführung ab. |
| Fehler | Nach unklarem Resultat pausiert die Reihenfolge. Wartezeiten wachsen zwischen 2 Sekunden und 2 Minuten. Erneute Ereignisse vor Ablauf senden nichts. Fehlgeschlagene oder konfliktbehaftete Aufträge bleiben im Einstellungsfenster zur Prüfung und zum Export. Formulare zeigen bei offenem Editor die bisherige Konfliktauflösung. |
| Anfragelast | Kein Polling, keine automatische Wiederholung der Lesefehler, 12 Sekunden Client-Zeitlimit pro RPC. Der SDK-Quellcode bestätigt, dass seine eigene Wiederholung nur idempotente HTTP-Methoden umfasst. Der Inventarclient ruft POST-RPC auf und legt die Retry-Entscheidung explizit bei der Warteschlange fest. |
| Datenbank | Der Dispatcher prüft Eigentümer und Befehlsargumente. Suche hat maximal 50 Ergebnisse pro Seite. Revisionen und eindeutige Auftrags-IDs sichern Schreibvorgänge ab. Ein Limit von 256 KiB gilt für die Argumente des SQL-Befehls. Die Kategoriezuordnung hat einen Index auf Eigentümer und Kategorie. Client-Zeitlimits allein setzen kein serverseitiges Abfragelimit. |

Ein bereits auf diesem Browser angemeldetes Konto kann seine lokale Kopie auch mit abgelaufenem Zugriffstoken öffnen. Die Kopie ist auf die gespeicherten Ansichten begrenzt. Netzwerkbefehle brauchen eine gültige Sitzung. Solange die Sitzung erneuert wird, kann die App weiterhin Aufträge lokal speichern. Eine Abmeldung sperrt den Zugriff auf die Kopie auf diesem Gerät und stößt ihre Löschung an. Unbestätigte Aufträge bleiben für dasselbe Konto erhalten. Browserdaten können vom Betriebssystem gelöscht werden.

Ungespeicherte Formulare leben im offenen Editor. Erst „Lokal gespeichert“ bestätigt den abgeschickten Auftragsinhalt in IndexedDB. Der Worker überträgt keine privaten API-Antworten und führt keine Schreibaufträge im Hintergrund aus. Foto-Offline-Ablage steht aus.

Bei gleichzeitig geöffneten Tabs bleibt ein Update wartend. Es kann nach Schließen weiterer Inventar-Tabs in den Einstellungen installiert werden. Ungespeicherte Eingaben oder laufende Synchronisierung blockieren die manuelle Aktivierung. Eine fehlerhafte neue Version lässt die bisherige App-Hülle verfügbar.

## Nachweis

`npm run build` erzeugt die öffentliche Offline-Hülle. `npm run test:offline-browser` testet sie in einem isolierten Chromium-Fenster mit simuliertem Supabase. Der Test prüft kalten Offline-Neustart nach Vorbereitung, lokale Suche, fehlende Details, dauerhafte Notizaufträge, erneute Verbindung, Kontowechsel, abgelaufene Sitzung, Serverausfall trotz bestehender Netzverbindung, beschädigten Build, Update mit mehreren Tabs und lokale Abmeldung. Die automatisierten Tests decken zusätzlich Datenalter, Speichergrenze pro Eintrag und Kontotrennung ab.

Die Simulation grenzt die App-Logik ab. Die echte Abnahme in Safari und als Homescreen-App auf iPhone/iPad bleibt erforderlich, insbesondere unter Speicherknappheit und nach Beenden durch das Betriebssystem.

## Nächste Schritte und Gegenprobe

1. **Offline-Start und Warteschlange auf Apple-Geräten abnehmen.** Einen Auftrag offline speichern, Safari schließen, erneut öffnen und erst dann verbinden. Homescreen-App, abgelaufene Anmeldung und Speicherknappheit getrennt prüfen. WebKit kann lokalen Speicher freigeben. Browser-Persistenz und späterer Export gehören deshalb zur Abnahme. Background Sync ist nicht überall verfügbar.
2. **Objekte gezielt offline bereithalten.** Ausgewählte Details und später Vorschaubilder lokal bestätigen und im UI sichtbar machen. Der bisherige Speicher deckt zuletzt erfolgreich geladene Ansichten ab.
3. **Serverlast messen.** Bei wachsendem Bestand Zeit und Anzahl der RPC-Aufrufe pro Start, Suche und Sync erfassen. Den SQL-Plan für die Teilstringsuche mit realistischen Daten prüfen. Der Fremdschlüsselindex hilft der Kategoriebeziehung. Die Textsuche profitiert davon nicht automatisch. Bei belegtem Scan-Problem Trigrammindex oder eine entsprechend zugeschnittene Suche bewerten.
4. **Bei Überschreitung der gemessenen Last Budgets ergänzen.** Ein Limit ausschließlich an der MCP Edge Function würde die vom Browser direkt aufgerufene Data API nicht schützen. Für harte Grenzen die gemeinsame RPC-Grenze oder alle erreichbaren Routen betrachten, nach Konto und Befehl messen und Datenbank-Timeouts auf den tatsächlichen Pfad begrenzen. Ein globaler Zähler pro Request erzeugt selbst zusätzliche Schreiblast.
5. **Fotos separat behandeln.** Dateispeicher und ein wiederaufnehmbarer Upload bekommen einen eigenen Status. Die Textwarteschlange trägt keine Bilddaten. Ein Upload wird erst nach Bestätigung von Datei und Metadaten als abgeschlossen angezeigt.

## Quellen

- [WebKit, Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [MDN, Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [TanStack Query, Caching Examples](https://tanstack.com/query/latest/docs/framework/react/guides/caching)
- [Supabase, Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [web.dev, The service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
