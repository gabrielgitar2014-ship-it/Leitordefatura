from flask import Flask, request, jsonify
from flask_cors import CORS
import pdfplumber
from pdf2image import convert_from_path
import tempfile
import os
import base64
import re
import time
from io import BytesIO
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# Configuração do Poppler (Deixe None se já estiver no PATH, ou ajuste o caminho)
POPPLER_PATH = None 

OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# =========================================================
# 1. MOTORES DE IMAGEM E TEXTO
# =========================================================

def convert_pdf_to_base64_images(pdf_path):
    images_data = []
    try:
        pil_images = convert_from_path(pdf_path, dpi=150, poppler_path=POPPLER_PATH)
        for i, img in enumerate(pil_images):
            buffered = BytesIO()
            img.save(buffered, format="JPEG", quality=80)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            images_data.append({
                "page": i + 1,
                "width": img.width,
                "height": img.height,
                "base64": f"data:image/jpeg;base64,{img_str}"
            })
    except Exception as e:
        print(f"Erro imagem: {e}")
    return images_data

def extract_raw_words(pdf_path):
    pages_data = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            words = page.extract_words(x_tolerance=2, y_tolerance=2, keep_blank_chars=False)
            pages_data.append({
                "page": i + 1,
                "width": float(page.width),
                "height": float(page.height),
                "words": words
            })
    return pages_data

# =========================================================
# 2. INTELIGÊNCIA DE AGRUPAMENTO (O CÉREBRO)
# =========================================================

def cluster_words_into_lines(words, y_tolerance=6):
    """
    Agrupa palavras soltas em linhas lógicas baseadas na altura Y.
    Tolerância estrita (6px) para evitar misturar linhas.
    """
    if not words: return []

    # 1. Ordena verticalmente (fundamental para fatiar)
    sorted_words = sorted(words, key=lambda w: float(w['top']))
    
    rows = []
    current_row = {
        'words': [sorted_words[0]],
        'base_top': float(sorted_words[0]['top'])
    }
    
    for word in sorted_words[1:]:
        word_top = float(word['top'])
        
        # Compara com a altura base da linha atual
        if abs(word_top - current_row['base_top']) <= y_tolerance:
            current_row['words'].append(word)
        else:
            rows.append(current_row['words'])
            current_row = {
                'words': [word],
                'base_top': word_top
            }
    rows.append(current_row['words'])

    # 2. Reconstrói o texto de cada linha (ordena X e junta)
    text_lines = []
    for row_words in rows:
        row_words.sort(key=lambda w: float(w['x0']))
        full_text = " ".join([w['text'] for w in row_words])
        if len(full_text.strip()) > 1:
            text_lines.append(full_text)
        
    return text_lines

def parse_line_text(text):
    """
    Regex para extrair dados de uma linha já formada.
    """
    clean_text = text
    
    # Valor (R$ opcional, negativo opcional, números)
    value_match = re.search(r'(?:R\$\s*)?(-?\s?\d{1,3}(?:\.\d{3})*,\d{2})', clean_text)
    value = ""
    if value_match:
        value = value_match.group(1).replace(" ", "") # Corrige "- 50" para "-50"
        clean_text = clean_text.replace(value_match.group(0), " ").strip()

    # Data
    date_match = re.search(r'(\d{2}/\d{2}(?:/\d{2,4})?)', clean_text)
    date = ""
    if date_match:
        date = date_match.group(1)
        clean_text = clean_text.replace(date, " ").strip()

    # Parcela
    inst_match = re.search(r'(\d{1,2}\s*/\s*\d{1,2})', clean_text)
    installment = ""
    if inst_match:
        installment = inst_match.group(1)
        clean_text = clean_text.replace(installment, " ").strip()

    # Descrição
    description = re.sub(r'^[ -]+|[ -]+$', '', clean_text)
    description = re.sub(r'\s+', ' ', description).strip()

    # Só retorna se tiver valor (é transação)
    if not value: return None

    return {
        "date": date,
        "description": description,
        "installment": installment,
        "value": value,
        "id": int(time.time() * 10000) + len(description) # ID único fake
    }

# =========================================================
# 3. ROTAS
# =========================================================

@app.post("/process_visual")
def process_visual():
    if "file" not in request.files: return jsonify({"error": "Sem arquivo"}), 400
    pdf = request.files["file"]
    filename = secure_filename(pdf.filename)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        pdf.save(tmp.name)
        tmp_path = tmp.name

    try:
        images = convert_pdf_to_base64_images(tmp_path)
        ocr_data = extract_raw_words(tmp_path)
        
        return jsonify({
            "status": "success",
            "filename": filename,
            "visual_data": {
                "images": images,
                "text_map": ocr_data
            }
        })
    except Exception as e:
        print(f"Erro: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(tmp_path): os.remove(tmp_path)

@app.post("/parse_selection")
def parse_selection():
    try:
        data = request.json
        raw_words = data.get('words', [])
        
        if not raw_words:
            return jsonify({"count": 0, "transactions": []})

        # 1. Organiza as palavras em linhas
        text_lines = cluster_words_into_lines(raw_words)
        
        # 2. Extrai dados de cada linha
        transactions = []
        for line in text_lines:
            parsed = parse_line_text(line)
            if parsed:
                transactions.append(parsed)
        
        return jsonify({
            "count": len(transactions),
            "transactions": transactions
        })

    except Exception as e:
        print(f"Erro parse: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)