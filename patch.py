import codecs
with codecs.open('renderer/app.js', 'r', 'utf-8') as f:
    c = f.read()

# Fix the broken regex line
import re
c = re.sub(r'const regex = /<\(\[\^<>\r?\n\r?\n\]\{1,60\}\)>/.*?;', 'const regex = /<([^<>\\n\\r]{1,60})>|\\[([^\\[\\]\\n\\r]{1,60})\\]/g;', c, flags=re.DOTALL)

with codecs.open('renderer/app.js', 'w', 'utf-8') as f:
    f.write(c)
