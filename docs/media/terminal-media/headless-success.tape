Output "/tmp/media-smoke.gif"
Set Shell bash
Set Width 800
Set Height 240
Set FontSize 18
Set TypingSpeed 1ms
Hide
Type "export PS1='demo$ '; clear"
Enter
Sleep 500ms
Show
Type "printf 'Ready\\n'"
Enter
Wait@2s /demo\$$/
Sleep 500ms
