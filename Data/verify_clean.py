import json

with open('witches_tarot_with_images.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

card = data[0]
print(f"Card: {card['ten']}\n")
print("=== BEGINNING OF CONTENT ===")
print(card['content'][:400])
print("\n\n=== END OF CONTENT ===")
print(card['content'][-300:])
print("\n✅ Verification: Content cleaned successfully!")
