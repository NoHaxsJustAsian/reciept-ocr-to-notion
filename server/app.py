from flask import Flask, request, jsonify, redirect, make_response
from flask_cors import CORS
import easyocr  # Import EasyOCR
import requests
import io
from dotenv import load_dotenv
import os
import base64 
from openai import OpenAI

load_dotenv()

HOSTNAME = os.getenv('HOSTNAME')
REDIRECT_URI = os.getenv('REDIRECT_URI')
NOTION_CLIENT_ID = os.getenv('NOTION_CLIENT_ID')
NOTION_CLIENT_SECRET = os.getenv('NOTION_CLIENT_SECRET')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=[HOSTNAME]) 

# Validate environment variables
missing_vars = []
if not REDIRECT_URI:
    missing_vars.append('REDIRECT_URI')
if not NOTION_CLIENT_ID:
    missing_vars.append('NOTION_CLIENT_ID')
if not NOTION_CLIENT_SECRET:
    missing_vars.append('NOTION_CLIENT_SECRET')
if not OPENAI_API_KEY:
    missing_vars.append('OPENAI_API_KEY')

if missing_vars:
    raise ValueError(f"Missing environment variables: {', '.join(missing_vars)}")

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
)

# Initialize EasyOCR reader
reader = easyocr.Reader(['en'])

# Helper function to retrieve the OCR database from Notion
def get_ocr_database_id(access_token):
    url = "https://api.notion.com/v1/search"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    data = {
        "filter": {
            "property": "object",
            "value": "database"
        }
    }

    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 200:
        results = response.json().get('results', [])
        for result in results:
            title_property = result.get('title', [])
            title_text = ''.join([t.get('text', {}).get('content', '') for t in title_property])
            if title_text == "OCR":
                print(f"Found OCR Database: {title_text}")
                return result['id']
        print("No OCR database found.")
        return None
    else:
        print(f"Failed to retrieve databases: {response.status_code} - {response.text}")
        return None

# Updated perform_ocr function to use EasyOCR
def perform_ocr(image):
    img_bytes = image.read()  # Read the image file as bytes
    img = io.BytesIO(img_bytes)  # Convert bytes to a file-like object for EasyOCR
    text_results = reader.readtext(img, detail=0)  # Read text from the image
    text = ' '.join(text_results)  # Join all text lines together
    return text

def clean_items(raw_text):
    prompt = f"""
    Here is the text from a receipt:
    {raw_text}
    
    Please extract the item names, quantities, and convert them to common names. Return the quantities, item names, and prices in the format: "quantity x item_name - $price".
    """
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=200,
        temperature=0.5
    )
    return response.choices[0].message.content.strip()

def add_item_to_notion(item_name, price, quantity, database_id, access_token):
    url = "https://api.notion.com/v1/pages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    data = {
        "parent": {"database_id": database_id},
        "properties": {
            "Name": {
                "title": [
                    {
                        "type": "text",
                        "text": {
                            "content": item_name
                        }
                    }
                ]
            },
            "Price": {
                "rich_text": [
                    {
                        "type": "text",
                        "text": {
                            "content": f"${price}"
                        }
                    }
                ]
            },
            "Quantity": {
                "number": quantity
            }
        }
    }
    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 200:
        print(f"Item '{item_name}' added to Notion")
        return True
    else:
        print(f"Error: {response.status_code}, {response.text}")
        return False

@app.route("/process_receipt", methods=["POST"])
def process_receipt():
    upload_to_notion_str = request.form.get('upload_to_notion', 'true').lower()
    upload_to_notion = upload_to_notion_str in ['true', '1', 'yes']
    print(f"upload_to_notion: {upload_to_notion}")

    access_token = None
    if upload_to_notion:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            print("Missing Authorization header.")
            return jsonify({"error": "Unauthorized: Missing Authorization header"}), 401
        
        if not auth_header.startswith('Bearer '):
            print("Invalid Authorization header format.")
            return jsonify({"error": "Unauthorized: Invalid Authorization header format"}), 401
        
        access_token = auth_header.split(' ')[1]
        print(f"Access Token: {access_token}")

    if 'receipt_image' not in request.files:
        print("No receipt image uploaded.")
        return jsonify({"error": "No receipt image uploaded"}), 400
    
    image = request.files['receipt_image']
    
    raw_text = perform_ocr(io.BytesIO(image.read()))
    print(f"OCR Text: {raw_text}")
    
    if not raw_text.strip():
        print("OCR failed to extract any text.")
        return jsonify({"error": "OCR failed to extract any text."}), 500
    
    cleaned_items = clean_items(raw_text)
    print(f"Cleaned Items: {cleaned_items}")
    
    if not cleaned_items:
        print("Failed to clean items using OpenAI.")
        return jsonify({"error": "Failed to clean items using OpenAI."}), 500
    
    database_id = None
    if upload_to_notion:
        database_id = get_ocr_database_id(access_token)
        if not database_id:
            print("No OCR database found in Notion.")
            return jsonify({"error": "No OCR database found in Notion."}), 404
    
    items = cleaned_items.split('\n')
    added_items = []
    for item in items:
        try:
            quantity_and_name, price = item.rsplit('-', 1)
            quantity, item_name = quantity_and_name.split('x', 1)
            quantity = int(quantity.strip())
            price = float(price.strip().replace('$', ''))
            item_name = item_name.strip()

            if upload_to_notion:
                success = add_item_to_notion(
                    item_name=item_name,
                    price=price,
                    quantity=quantity,
                    database_id=database_id,
                    access_token=access_token
                )
                if not success:
                    continue

            added_items.append({
                "quantity": quantity,
                "item_name": item_name,
                "price": price
            })
        except ValueError as ve:
            print(f"ValueError parsing item '{item}': {ve}")
            continue
        except Exception as e:
            print(f"Unexpected error parsing item '{item}': {e}")
            continue

    return jsonify({"message": "Receipt processed successfully", "items": added_items})

if __name__ == "__main__":
    app.run(host='0.0.0.0')
