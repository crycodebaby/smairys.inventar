# ChatGPT-Verbindung

Stand 26. November 2026. Die erste Befehlsschicht ist implementiert und in Supabase eingerichtet. Die vollständige Anmeldung aus ChatGPT ist noch freizuschalten und zu testen.

## Zwei Verbindungswege

Die Web-App registriert nach der Anmeldung sieben Seitenwerkzeuge, wenn der Browser navigator.modelContext bereitstellt. ChatGPT kann sie im unterstützten Desktop-Browser über die geöffnete Seite nutzen. Die Werkzeuge werden beim Wechsel der Anmeldung abgemeldet. Ihre Verfügbarkeit hängt vom ChatGPT-Konto und der jeweiligen Oberfläche ab.

Der zweite Weg ist ein persönliches MCP-Plugin mit OAuth-Anmeldung. Damit kann ein Chat den erreichbaren Supabase-Endpunkt aufrufen. Die Anmeldung und Zustimmung gehören zum eigenen Inventarkonto. Der ChatGPT-Chat übernimmt die sprachliche Arbeit. Die Inventarschnittstelle führt die benannten Befehle aus.

Das Paket unter plugin enthält Manifest und MCP-Konfiguration. Es ist als Verbindungsvorlage vorbereitet. Registrierung, Installation und tatsächliche Verknüpfung im ChatGPT-Konto stehen aus.

## Eingerichtete Schnittstellen

| Zweck | Adresse |
| --- | --- |
| Status | https://xywnhifzahwcmclrfsil.supabase.co/functions/v1/inventory/health |
| MCP | https://xywnhifzahwcmclrfsil.supabase.co/functions/v1/inventory/mcp |
| OAuth-Ressourcenmetadaten | https://xywnhifzahwcmclrfsil.supabase.co/functions/v1/inventory/.well-known/oauth-protected-resource |
| Einzelner HTTP-Befehl | POST https://xywnhifzahwcmclrfsil.supabase.co/functions/v1/inventory/commands/BEFEHLSNAME |

Alle Inventarzugriffe brauchen eine gültige Benutzeranmeldung. Öffentlich abrufbar sind Status und Verbindungsmetadaten. Die Anwendung verwendet keine privilegierten Serviceschlüssel im Browser oder Pluginpaket.

## Application Commands

| Befehl | Wirkung |
| --- | --- |
| search_inventory | Gegenstände nach Text suchen, mit Limit und Offset |
| get_item | Gegenstand, Revision und Notizen lesen |
| list_labels | Kategorien, Zustände, Arbeitsschritte und Markierungen auflisten |
| create_item | Gegenstand erfassen |
| update_item | Benannte Felder unter Angabe der gelesenen Revision ändern |
| add_note | Abschrift und Interpretation als getrennte Felder anheften, optional mit bestätigter Datei-ID desselben Objekts |
| create_label | Eigene Kategorie, Zustandsbezeichnung oder Markierung erstellen |

Jeder Schreibauftrag erhält eine operation_id als UUID. Bei ungewissem Ergebnis werden dieselbe UUID und dieselben Argumente wiederholt. Eine veränderte Nutzlast unter derselben UUID wird abgewiesen. Erfolgreiche Schreibaufträge werden mit Ergebnis und optionaler OAuth-Client-ID in inventory_command_log protokolliert. Ein Revisionskonflikt liefert die aktuelle Fassung zurück. Der Client behält seine gewünschte Änderung zur Klärung.

Beispiel für den HTTP-Aufruf mit dem Benutzer-Zugriffstoken im Authorization-Header

```json
{
  "operation_id": "99cdd700-b03a-4bc4-8a4b-d80b1c92c813",
  "title": "Röhre mit noch ungeprüftem Aufdruck",
  "brand": "",
  "model": ""
}
```

Die HTTP- und MCP-Adapter prüfen Eingaben mit denselben Zod-Schemas. Die PostgreSQL-Befehlsgrenze prüft Eigentümer und Fremdbezüge erneut. Direkte Tabellenschreibrechte für normale Benutzer sind entzogen. Die eng begrenzte interne Funktion führt die atomare Änderung unter einem aus auth.uid abgeleiteten Eigentümer aus. Tabellenzugriff zum Lesen bleibt durch RLS beschränkt.

## OAuth-Freischaltung

Die öffentliche Supabase-OAuth-Discovery meldet bei der letzten Prüfung feature_disabled. Der Nutzer hat festgelegt, dass das bestehende Projekt beibehalten wird. Auch der neu verbundene Supabase-Zugang erreicht es. Der Dashboardzugriff des zuletzt verwendeten Chrome-Kontos wurde nach dessen Neuanmeldung noch nicht abschließend geprüft.

Die Web-App ist unter https://inventar.smairys.de bereitgestellt; HTTPS und ausgelieferte Assets wurden geprüft. Im zugriffsberechtigten Supabase-Dashboard werden folgende Werte eingerichtet.

1. Auth Site URL auf https://inventar.smairys.de setzen und die Anmelderückkehr zu dieser Anwendung zulassen.
2. OAuth-Server einschalten und die eigene Zustimmungsseite auf den Rootpfad / der Web-App legen. Sie verarbeitet authorization_id.
3. Dynamic Client Registration für die persönliche MCP-Verbindung aktivieren oder einen festen Client mit der von ChatGPT angezeigten Rückkehradresse registrieren.
4. Unter Auth Hooks die Funktion public.inventory_access_token_hook als Custom Access Token Hook auswählen. Sie ergänzt für OAuth-Zugriffstokens die Inventar-MCP-Ressource als Audience und erhält zugleich authenticated für die Supabase-API.
5. OAuth-Discovery und Tokenausstellung überprüfen. Der MCP-Endpunkt akzeptiert nur gültige Tokens des richtigen Projekts mit client_id und seiner Ressourcen-Audience.
6. In ChatGPT die eigene MCP-Verbindung über die oben genannte Adresse hinzufügen, OAuth wählen und im eigenen Inventarkonto zustimmen. Die genaue Verfügbarkeit wird im tatsächlichen Konto geprüft.
7. Einen Gegenstand aus dem Chat erfassen, zurücklesen und anschließend über die Web-App prüfen. Änderungen und Accountabgrenzung gehören zur Abnahme.

Die Supabase-Dashboard-Anmeldung verwaltet das Projekt. Die Anmeldung in der Inventar-Web-App ist eine separate Benutzeranmeldung für den Datenzugriff.

## Nachweise und offene Arbeiten

Build und Typprüfung haben bestanden. Sieben automatisierte Tests prüfen Befehlseingaben, MCP-Metadaten, korrekt signierte und gefälschte Testtokens, Ressourcen-Audience, HTTP-Eingaben, Anmeldepflicht und Seitenwerkzeug-Lebenszyklus.

Die PostgreSQL-Testdatei supabase/tests/inventory_commands.sql wurde im Projekt ausgeführt. Sie prüft Idempotenz, abweichende Wiederholungen, Revisionen, Notizen, RLS und Zugriffe zwischen zwei Testkonten. Alle Testdaten werden im selben Durchlauf per Rollback zurückgenommen. Der Security Advisor lieferte bei der ersten Bereitstellung keine Hinweise.

Status und Ressourcenmetadaten wurden live mit HTTP 200 geprüft. Der anonyme MCP-Aufruf lieferte HTTP 401 und eine OAuth-Anmeldeanforderung. Ein kompletter OAuth-Durchlauf mit einem echten Konto ist offen. Das Web-Hosting ist eingerichtet und per HTTPS geprüft. Gerenderte Browser- und Geräteprüfung, Foto-Uploads und Offlinebetrieb sind noch umzusetzen beziehungsweise nachzuweisen.

## Entwicklung

Node.js ab Version 24 und npm verwenden. npm ci installiert die fixierten Abhängigkeiten. npm run dev startet die lokale Web-App. npm run build prüft die Typen und baut dist. npm test führt die automatisierten Tests aus.

.env.local enthält die Konfiguration aus .env.example und wird von Git ausgeschlossen. Für die veröffentlichte Anwendung werden dieselben VITE-Variablen beim Hosting als Build-Umgebung gesetzt.

Supabase CLI ist als fixierte Entwicklungsabhängigkeit enthalten. In dieser eingeschränkten Windows-Umgebung wird der CLI-Aufruf mit DO_NOT_TRACK=1 und SUPABASE_TELEMETRY_DISABLED=true ausgeführt. Dadurch startet sie ohne Schreibzugriff auf die globale Telemetriedatei. CLI-Unterbefehle werden mit ihrer Hilfeausgabe geprüft.

Migrationen wurden über die Supabase-Anbindung angewendet. Die lokalen Versionsnamen entsprechen dem tatsächlichen Remote-Migrationsverlauf. Die GitHub-Verknüpfung darf bereits angewendete Migrationen anhand dieser identischen Versionen erkennen. Ein automatischer GitHub-Deploymentdurchlauf ist gesondert zu prüfen.

## Quellen

- [OpenAI, eigene MCP-Server verbinden](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [OpenAI, MCP-Server bauen](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI, Plugin-Authentifizierung](https://developers.openai.com/plugins/build/auth)
- [OpenAI, Pluginpakete](https://developers.openai.com/plugins/build/plugins)
- [OpenAI, Seitenwerkzeuge im Desktop-Browser](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app)
- [Supabase, MCP-Authentifizierung](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase, OAuth-Server einrichten](https://supabase.com/docs/guides/auth/oauth-server/getting-started)

Abruf am 26. November 2026. Kontofunktionen, OAuth-Einstellungen und Oberflächen werden vor der jeweiligen Freischaltung erneut geprüft.
