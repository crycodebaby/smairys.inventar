# Web-Hosting

Die Web-App wird aus crycodebaby/smairys.inventar, Branch main, mit Vercel bereitgestellt. Das Vercel-Projekt heißt smairys-inventar und liegt im vorhandenen Hobby-Team robin-schmeiries-projects. Die Produktionsadresse ist https://inventar.smairys.de.

## Build

Node.js 24.x, npm ci, npm run build, Ausgabeordner dist, Framework Vite. vercel.json hält die Build-Konfiguration und HTTP-Header fest. Die Git-Anbindung übernimmt neue Commits auf main als Produktionsdeployments; weitere Branches erhalten Vorschauen.

Vor einer Veröffentlichung npm run build und npm test ausführen. Das Deployment anschließend auf READY und die veröffentlichte Commit-ID prüfen. Die Anmeldung braucht zusätzlich die Supabase-URL-Konfiguration; ein erfolgreicher Build bestätigt keinen vollständigen Anmeldevorgang.

## Umgebung

VITE_APP_URL, VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY werden im Vercel-Projekt für production, preview und development hinterlegt. Diese Werte sind für den Browser bestimmt. Privilegierte Serviceschlüssel bleiben vollständig außerhalb der Web-App. Umgebungsänderungen erfordern einen neuen Build.

Die Vercel-Dateien, Zugangsdaten, Originalfotos und die lokale SQLite-Datei werden nicht in Git aufgenommen. Vercel baut ausschließlich den versionierten Quellcode. Öffentlich ausgeliefert wird der Ordner dist. Die Login-Seite ist öffentlich erreichbar; Datenzugriff setzt die Supabase-Benutzeranmeldung und die bestehenden Eigentümerprüfungen voraus.

## Domain

Nur inventar.smairys.de dem Inventar-Projekt zuweisen. Das konkrete CNAME-Ziel aus dessen Vercel-Domainkonfiguration übernehmen und bei Cloudflare für den Namen inventar als Nur DNS eintragen. Vorhandene Wildcard-, Hauptdomain-, Mail-, TXT-, CAA- und NS-Einträge bleiben bestehen. Eine zusätzliche Eigentumsprüfung bekommt ihren eigenen TXT-Wert. Eine DNS-Konfiguration gilt erst nach bestätigter Auflösung, gültigem HTTPS und erfolgreichem Seitenabruf als geprüft.

Am 26. November 2026 bestätigte Vercel die bestehende Domain mit verified=true, misconfigured=false und ohne DNS-Konflikte. Der vorhandene CNAME verweist auf smairys.de. Als bevorzugtes direktes CNAME-Ziel liefert Vercel für das Inventar-Projekt 84b0759c98d9516d.vercel-dns-017.com. Die bestehende, von Vercel akzeptierte DNS-Konfiguration wurde bei der ersten Bereitstellung nicht verändert. Ein späterer direkter CNAME würde ausschließlich den Eintrag inventar betreffen.

## Supabase

Die Auth Site URL lautet https://inventar.smairys.de. Die erlaubte Anmelderückkehr muss auch den authorization_id-Parameter der OAuth-Zustimmung erhalten. OAuth-Server, Authorization Path / und public.inventory_access_token_hook werden nach docs/CHATGPT.md eingerichtet. Die Dashboard-Anmeldung ist vom Benutzerkonto innerhalb der Web-App getrennt.

Der Nutzer hat die Live Site URL und die zusätzliche Freigabe https://inventar.smairys.de/** am 26. November 2026 gespeichert, nachdem ein älterer E-Mail-Link zu localhost:3000 mit otp_expired zurückführte. Nach Änderungen einen frischen Link anfordern und ausschließlich die neueste E-Mail verwenden. Eine URL-Korrektur macht einen bereits verbrauchten oder abgelaufenen Link nicht wieder gültig. Standardvorlagen verwenden {{ .ConfirmationURL }} als Linkziel; ein direkt auf die Site URL gesetzter E-Mail-Link überspringt die Verifikation. Ein Anmeldecode wird nur dann mitgesendet, wenn die E-Mail-Vorlage {{ .Token }} enthält.

## Nachweise

Aktueller Deployment-, Domain- und Anmeldestatus stehen in STATUS.md. Foto-Uploads und Offlinebetrieb sind eigene Arbeitspakete und nicht Bestandteil des ersten Web-Hostings.

Erstes konfiguriertes Produktionsdeployment: dpl_HXwVVAShSA9d4cvw78urWKi4hUkA, Commit 8e4c2d33914864dd559f2f14215b3709584daf3e, READY. Am 26. November 2026 lieferten https://inventar.smairys.de und beide referenzierten JavaScript-/CSS-Assets HTTP 200. Die HTTP-Header aus vercel.json wurden bestätigt. Browser-Build und Projektkonfiguration stimmen mit dem bestehenden Supabase-Projekt überein. Ein vollständiger Login wurde dabei nicht ausgelöst.
