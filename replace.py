import os

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Case sensitive replacements
        new_content = content.replace('COOKIE', 'COOKIE')
        new_content = new_content.replace('Cookie', 'Cookie')
        new_content = new_content.replace('cookie', 'cookie')
        new_content = new_content.replace('COOKIES', 'COOKIES')
        new_content = new_content.replace('Cookies', 'Cookies')
        new_content = new_content.replace('cookies', 'cookies')

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {filepath}")
    except Exception as e:
        # Ignore files that cannot be read as utf-8 (e.g. binaries)
        pass

for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '.next' in root or 'venv' in root or '__pycache__' in root:
        continue
    for file in files:
        if file.endswith(('.js', '.jsx', '.ts', '.tsx', '.py', '.md', '.sql', '.html', '.css', '.json', '.env', '.env.local')):
            replace_in_file(os.path.join(root, file))
