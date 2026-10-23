-- CRM Ordner: nimmt Links der Form screenbox-ordner://anlegen?... aus dem CRM entgegen
on open location theURL
	set helper to quoted form of (POSIX path of (path to resource "ordner.py"))
	try
		set rootLines to paragraphs of (do shell script "/usr/bin/python3 " & helper & " roots")
	on error errMsg
		display alert "CRM Ordner" message errMsg as critical
		return
	end try
	set names to {}
	set paths to {}
	repeat with l in rootLines
		set AppleScript's text item delimiters to tab
		set end of names to text item 1 of l
		set end of paths to text item 2 of l
		set AppleScript's text item delimiters to ""
	end repeat
	if (count of names) is 0 then
		display alert "CRM Ordner" message "Kein Ziel gefunden (weder ~/Projekte noch die SSD)." as critical
		return
	end if
	set choice to choose from list names with title "Projektordner anlegen" with prompt "Wo soll der Projektordner angelegt werden?" default items {item 1 of names}
	if choice is false then return
	set chosenPath to ""
	repeat with i from 1 to count of names
		if item i of names is (item 1 of choice) then set chosenPath to item i of paths
	end repeat
	try
		set projectPath to do shell script "/usr/bin/python3 " & helper & " create " & quoted form of theURL & " " & quoted form of chosenPath
		do shell script "open " & quoted form of projectPath
	on error errMsg
		display alert "CRM Ordner" message errMsg as critical
	end try
end open location

on run
	display dialog "CRM Ordner ist installiert. Projektordner legst du im CRM über den Knopf „Projektordner anlegen“ an." buttons {"OK"} default button 1 with title "CRM Ordner"
end run
