import json
import re

# Load the JSON file
with open('witches_tarot_with_images.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Function to clean content more aggressively
def clean_content(content):
    if not content:
        return content
    
    # Remove header: everything before "Ý nghĩa lá"
    match = re.search(r'Ý nghĩa lá', content)
    if match:
        content = content[match.start():]
    
    # Remove footer: everything from "Bộ bài Witches Tarot" onwards
    match = re.search(r'Bộ bài Witches Tarot', content)
    if match:
        content = content[:match.start()]
    
    # Also remove "Rate this post", rating info, "TÀI TRỢ", "Bài viết liên quan:", etc.
    content = re.sub(r'\nRate this post.*', '', content, flags=re.DOTALL)
    content = re.sub(r'\nTÀI TRỢ.*', '', content, flags=re.DOTALL)
    content = re.sub(r'\nBài viết liên quan:.*', '', content, flags=re.DOTALL)
    content = re.sub(r'\nChia sẻ\n\d+', '', content)
    
    # Clean up multiple consecutive newlines
    content = re.sub(r'\n\n\n+', '\n\n', content)
    
    # Remove trailing whitespace
    content = content.strip()
    
    return content

# Apply cleaning to all cards
cleaned_count = 0
for card in data:
    if 'content' in card:
        original = card['content']
        card['content'] = clean_content(card['content'])
        if card['content'] != original:
            cleaned_count += 1

# Save cleaned data
with open('witches_tarot_with_images.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"✅ Cleaned {cleaned_count} cards")
print(f"Total cards: {len(data)}")
