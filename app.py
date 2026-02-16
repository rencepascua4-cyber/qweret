from flask import Flask, request, jsonify
from flask_cors import CORS
import PyPDF2
import io
import os

app = Flask(__name__)
# Enable CORS for all routes
CORS(app, origins=['https://lawrencee.pythonanywhere.com', 'http://localhost:3000', 'http://127.0.0.1:3000'])

@app.route('/api/clean-pdf', methods=['POST', 'OPTIONS'])
def clean_pdf():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        # Check if file is present in request
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        # Check if file is empty
        if file.filename == '':
            return jsonify({'error': 'Empty file provided'}), 400
        
        # Check if it's a PDF
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'File must be a PDF'}), 400
        
        # Read PDF
        pdf_bytes = file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
        
        # Extract text from all pages
        text = ""
        for page_num, page in enumerate(pdf_reader.pages, 1):
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        # Clean the text (remove extra spaces, normalize line breaks)
        cleaned_text = ' '.join(text.split())
        
        # Get metadata
        metadata = {}
        if pdf_reader.metadata:
            metadata = {
                'title': pdf_reader.metadata.get('/Title', ''),
                'author': pdf_reader.metadata.get('/Author', ''),
                'pages': len(pdf_reader.pages)
            }
        else:
            metadata = {
                'pages': len(pdf_reader.pages)
            }
        
        # Calculate stats
        stats = {
            'characters': len(cleaned_text),
            'words': len(cleaned_text.split()),
            'lines': len([line for line in text.split('\n') if line.strip()])
        }
        
        return jsonify({
            'text': cleaned_text,
            'metadata': metadata,
            'stats': stats
        })
        
    except PyPDF2.errors.PdfReadError:
        return jsonify({'error': 'Invalid or corrupted PDF file'}), 400
    except Exception as e:
        print(f"Error processing PDF: {str(e)}")
        return jsonify({'error': f'Error processing PDF: {str(e)}'}), 500

@app.route('/', methods=['GET'])
def home():
    return jsonify({'status': 'PDF Text Extractor API is running'})

if __name__ == '__main__':
    # Get port from environment variable (for PythonAnywhere) or use 5000 for local
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)