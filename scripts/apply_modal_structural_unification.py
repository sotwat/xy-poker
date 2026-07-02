import os

components_dir = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components'

css_files = {
    'RulesModal.css': {
        'overlay': '.rules-overlay',
        'content': '.rules-content'
    },
    'SkinStore.css': {
        'overlay': '.skin-store-overlay',
        'content': '.skin-store-modal'
    },
    'ContactForm.css': {
        'overlay': '.modal-overlay',
        'content': '.contact-modal'
    },
    'MyPage.css': {
        'overlay': '.mypage-overlay',
        'content': '.mypage-content'
    },
    'AuthModal.css': {
        'overlay': '.auth-overlay',
        'content': '.auth-content'
    }
}

# General premium layout values to enforce
overlay_template = """{overlay} {{
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: radial-gradient(circle at center, #1b1b2f 0%, #0d0d1a 100%) !important;
    z-index: 2000 !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 16px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
}}"""

content_template = """{content} {{
    flex: 1 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    background: rgba(255, 255, 255, 0.05) !important;
    backdrop-filter: blur(8px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 20px !important;
    padding: 16px !important;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 14px !important;
    box-sizing: border-box !important;
    overflow-y: auto !important;
    margin: 0 !important;
}}"""

for filename, selectors in css_files.items():
    file_path = os.path.join(components_dir, filename)
    if not os.path.exists(file_path):
        print(f"Warning: {filename} not found.")
        continue

    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    # Prepend or append the unified styles to ensure they override any local definitions cleanly
    new_styles = "\n\n/* --- Premium Structural Unification --- */\n" + \
                 overlay_template.format(overlay=selectors['overlay']) + "\n" + \
                 content_template.format(content=selectors['content']) + "\n"

    # Only append if not already appended
    if "Premium Structural Unification" not in content:
        with open(file_path, 'a', encoding='utf-8') as file:
            file.write(new_styles)
        print(f"Success: Appended structural unification to {filename}.")
    else:
        print(f"Warning: {filename} already unified.")
