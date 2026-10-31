# ---
# relationships:
#   implements: ../../guides/terminal-media.md
# ---
Output "session.gif"
Set Shell "bash"
Set Width 800
Set Height 260
Set FontSize 18
Set TypingSpeed 20ms
Hide
Type "export PS1='demo$ '; clear"
Enter
Sleep 500ms
Show
Type "cat items.txt"
Enter
Wait@5s /demo\$$/
Sleep 2s
