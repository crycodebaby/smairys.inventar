# Datenvertrag für die Umsetzung

Status am 26. November 2026 ist Zielvertrag. Das bestehende SQLite-Schema bildet den Startkatalog ab. Die hier genannten Erweiterungen werden mit der App-Umsetzung durch Migrationen eingeführt.

## Bestand und Nachweise

Ein Gegenstand, eine Datei, eine Notiz und eine Rechercheaussage haben jeweils eine eigene stabile ID. Die lesbare Inventarnummer ist ein zusätzliches fachliches Kennzeichen. Mehrere Fotos desselben Gegenstands erzeugen einen Gegenstand mit mehreren Dateibeziehungen. Herkunft, exakter Wortlaut, Interpretation und Sicherheit der Aussage bleiben nachvollziehbar.

Geldbeträge verwenden ganzzahlige Untereinheiten und eine Währung. Technische Messwerte brauchen Einheit, Messbedingungen, Herkunft und zeitliche Einordnung. Unklare Datumsangaben behalten den Originaltext. Dateinamen und Beschriftungen liefern Hinweise, deren Bestätigung gesondert festgehalten wird.

## Erweiterbare Bezeichnungen

Kategorien, Zustände, Arbeitsschritte und Markierungen sind benutzerdefinierte Datensätze. Eine Umbenennung ändert den Namen bei derselben ID. Zuordnungen zu Gegenständen und Notizen bleiben erhalten. Farben werden als validierte Farbwerte gespeichert und durch Text ergänzt.

Ein X an einer Markierung löst deren Zuordnung. Das Entfernen eines verwendeten Stammdatensatzes zeigt betroffene Zuordnungen und bietet Ersatz oder Archivierung. Ein offline erstellter Gegenstand kann auf eine inzwischen archivierte Kategorie verweisen. Dieser Fall braucht eine sichtbare Auflösung. Gleichnamige offline angelegte Kategorien werden über einen benannten Konflikt oder eine nachvollziehbare Zusammenführung behandelt.

## Datenabgleich

Bei Auswahl von PowerSync führen die App-Ansichten ihre Datensatzänderungen über die lokale Datenbank aus. Der Connector sendet sie an einen autorisierten Schreibendpunkt. Eine zusätzliche direkte Änderung derselben Datensätze über einen zweiten Clientpfad braucht eine überprüfte Integrationsregel.

Ein schreibender Auftrag enthält eine eindeutige operation_id, die Datensatz-ID, die Ausgangsrevision und die eigentliche Änderung. Der Server ordnet den Auftrag dem angemeldeten Konto zu. Validierung, Revisionsvergleich, Datensatzänderung und Speicherung der erfolgreichen operation_id erfolgen in einer Transaktion. Ein wiederholter Auftrag liefert das frühere Ergebnis. Ein konkurrierender Auftrag erhält eine Konfliktantwort mit beiden Fassungen.

Auch ein fachlich abgelehnter Auftrag braucht einen dauerhaften Status. Er wird lokal mit seiner Fassung zur Klärung erhalten. Der Connector behandelt die Antwort so, dass weitere unabhängige Aufträge nach dokumentierter SDK-Semantik verarbeitet werden können. Die Reihenfolge mehrerer offline geänderter Fassungen desselben Datensatzes und die Zuordnung neuer Serverrevisionen gehören zum Durchstich.

Archivierungen und Löschungen bekommen übertragbare Zustände. Die Aufbewahrung von Löschinformationen muss auch lange offline gewesene Geräte berücksichtigen. Ein App-Update oder Schemawechsel erhält die lokalen ausstehenden Änderungen oder bietet zuvor eine getestete Wiederherstellung.

## Fotos und Dokumente

Das im Browser tatsächlich empfangene Original wird mit SHA-256, MIME-Typ, Bytezahl und ursprünglichem Namen erfasst. Eine vom Betriebssystem bereits vorgenommene Umwandlung wird als Herkunftseigenschaft dokumentiert, sobald sie feststellbar ist. Ein Vorschaubild ist eine eigene Ableitung. Dateityp, Pixelmaße, Orientierung und Speicherbedarf werden vor der Vorschauerstellung geprüft.

Die Anwendung verwendet einen dauerhaften Objektbezeichner, beispielsweise die Datei-UUID unter dem Eigentümerpfad. Kurzlebige signierte Download-URLs entstehen bei Bedarf. Ein relativer lokaler Dateipfad bleibt für Importe und Exporte nützlich. Der Cloud-Bezug braucht zusätzliche Felder für Bucket und Objektbezeichner.

Ein Dateivorgang unterscheidet lokal gespeichert, ausstehend, wird übertragen, zentral bestätigt und fehlgeschlagen. Die bestätigte Speicherung muss auch nach einem Neustart nachvollziehbar sein. Ein erfolgreich gespeicherter Metadatensatz allein bestätigt noch keine Bilddatei.

Dateiupload und Datenbankänderung umfassen zwei Speicher. Die Implementierung verwendet deshalb ein wiederholbares Uploadvorhaben mit stabiler Datei-ID. Nach Upload, Serverprüfung und Metadatenbestätigung wird der Vorgang abgeschlossen. Ein Wiederanlauf prüft bereits vorhandene Objekte und führt offene Vorgänge fort. Ein Hintergrundabgleich behandelt verwaiste Objekte und verwaiste Referenzen mit einer Wiederherstellungsfrist.

Uppy/Tus kann den Transfer übernehmen. Die persistente lokale Datei, die Zuordnung zum Upload und die Fehlerbehandlung müssen zusammenpassen. Uppy Golden Retriever nennt für die standardmäßige IndexedDB-Dateiwiederherstellung eine Grenze von 10 MiB. Größere iPhone-Bilder gehören daher ausdrücklich in die Wiederanlaufprüfung. Ein einzelner Upload bekommt einen verantwortlichen Transferpfad. Quelle S22 in QUELLEN.md.

## Offlineumfang

Die Benutzeroberfläche und die vorbereiteten Datensätze stehen lokal bereit. Fotos werden als Vorschaubilder und gezielt ausgewählte Originale heruntergeladen. Der Benutzer kann einen Gegenstand oder eine Sammlung offline vormerken. „Offline verfügbar“ erscheint nach Prüfung des tatsächlichen lokalen Bestands.

Neue Aufnahmen bleiben bis zur Bestätigung lokal erhalten. Lokale Speicherfehler werden als Fehler gemeldet. Schreibvorgänge dürfen erst nach bestätigter lokaler Persistenz als gespeichert gelten. Die App prüft die verwendete Speicherart, fragt Persistenz an und zeigt begrenzten Offlinebetrieb bei fehlender Unterstützung. Ein SDK-Fallback auf eine reine RAM-Datenbank erfüllt diesen Vertrag nicht.

Die App versucht den Abgleich beim Öffnen, bei Rückkehr in den Vordergrund, nach wiederhergestellter Verbindung und über eine manuelle Aktion. Der sichtbare Status unterscheidet Datensätze und Dateien. Ein geschlossenes oder vom Betriebssystem beendetes Browserfenster benötigt beim nächsten Öffnen einen Wiederanlauf.

## Rechte und Anmeldung

Der zentrale Bestand bekommt einen Eigentümerbezug. Bei Supabase werden Tabellen und private Storage-Buckets über Row Level Security abgesichert. Die Zugriffsfilter für PowerSync werden zusätzlich anhand der gleichen Eigentümerbeziehung getestet. Serverseitige privilegierte Schlüssel bleiben in der Serverumgebung.

Das System unterstützt zunächst einen Eigentümer auf mehreren Geräten. Tests mit einem zweiten Testkonto belegen die Abgrenzung. Lokal gespeicherte Bestände sind dem jeweiligen Konto zugeordnet. Ein Kontowechsel muss ausstehende Dateien und Änderungen berücksichtigen und den vorherigen Bestand für das neue Konto unzugänglich machen. Offline-Anmeldung und erneute Onlineauthentifizierung werden mit einem abgelaufenen Sitzungstoken überprüft.

## Lücken des Startschemas

Vor der Cloud-Übernahme müssen Eigentümerbezug, Zugriffsregeln, Uploadvorhaben, Konfliktdatensätze, operation_id und serverseitige Transaktionslogik ergänzt werden. Mehrere Stammtabellen und Beziehungstabellen benötigen eine definierte Strategie für Änderungen und Löschungen. Das Feld revision in items und notes ist bisher lediglich ein gespeicherter Wert. Seine Erhöhung und Prüfung sind noch zu implementieren.

PowerSync führt eigene Client-IDs und ein eigenes abgeleitetes Client-Schema. Für synchronisierte Beziehungstabellen werden geeignete stabile IDs ergänzt. Lokale SQLite-Constraints und zusammengesetzte Schlüssel werden in Servermigration und Clientmodell bewusst übersetzt. SQL-Syntax und lokale Pfade werden bei der Migration geprüft.

## Sicherung

Ein vollständiger Export enthält Datensätze, Beziehungen, Dokumente, Originaldateien, Ableitungen nach Auswahl, Prüfsummen und Schema-/Exportversion. Nach der Wiederherstellung werden Stückzahl, Verknüpfungen und alle Original-Prüfsummen verglichen. Die Sicherung der Dateien und die Sicherung der Datenbank bekommen jeweils einen protokollierten Nachweis. SQLite-Schnappschüsse während laufender Schreibvorgänge werden mit einer konsistenten Backup-Methode erzeugt.
