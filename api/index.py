from flask import Flask, request, jsonify
import os
import time
from concurrent.futures import ThreadPoolExecutor
import openparse
from werkzeug.utils import secure_filename
from openai import OpenAI
import csv

app = Flask(__name__)
executor = ThreadPoolExecutor(5)  # 控制并发数

parser = openparse.DocumentParser()

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx",
    api_key="sk-3221802e38c24c168dd2957fb62d7560",  # 如何获取API Key：https://help.aliyun.com/zh/model-studio/developer-reference/get-api-key
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)

# 配置
UPLOAD_BASE_FOLDER = 'public/upload'
ALLOWED_EXTENSIONS = {'pdf'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# 确保上传目录存在
os.makedirs(UPLOAD_BASE_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/python', methods=['POST'])
def upload_file():
    # 检查是否有文件
    if 'files' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    files = request.files.getlist('files')
    saved_files = []
    not_saved_files = []
    
    # 获取header中的X-Session-Id
    session_id = request.headers.get('X-Session-Id')
    if session_id is None:
        return jsonify({'error': 'X-Session-Id header is missing'}), 400

    # 创建session_id对应的子目录
    session_pdf_folder = os.path.join(UPLOAD_BASE_FOLDER, session_id, 'pdf')
    os.makedirs(session_pdf_folder, exist_ok=True)
    session_csv_folder = os.path.join(UPLOAD_BASE_FOLDER, session_id, 'csv')
    os.makedirs(session_csv_folder, exist_ok=True)

    for file in files:
        # 检查文件是否为空
        if file.filename == '':
            not_saved_files.append({
                'file_name': file.filename,
                'error': 'filename is empty'
            })
            continue
        else:
            print(f"Received file: {file.filename}")
            
        # 检查文件类型
        if not allowed_file(file.filename):
            not_saved_files.append({
                'file_name': file.filename,
                'error': 'file type not allowed'
            })
            continue
            
        # 检查文件大小
        file.seek(0, os.SEEK_END)
        file_length = file.tell()
        if file_length > MAX_FILE_SIZE:
            not_saved_files.append({
                'file_name': file.filename,
                'error': 'file size exceeds limit'
            })
            continue
        file.seek(0)
        
        # 安全保存文件到session_id子目录
        filename = secure_filename(file.filename)
        filename = file.filename
        print(f"Processing file: {filename}")
        save_path = os.path.join(session_pdf_folder, filename)
        file.save(save_path)

        # 将成功保存的文件信息记录下来，并将结果返回给前端用于快速响应。
        # saved_files用于openparse处理
        saved_files.append({
            'path': save_path,
        })

        if not saved_files:
            return jsonify({'error': 'No valid files uploaded'}), 400

    # 立即返回响应，后台处理
    try:
        future = executor.submit(process_files, saved_files, session_csv_folder)
        # 添加回调函数来捕获异常
        def callback(f):
            try:
                f.result()  # 这会抛出任务中的任何异常
            except Exception as e:
                print(f"Background task failed: {str(e)}")
        future.add_done_callback(callback)
        print("Background processing started successfully")
    except Exception as e:
        print(f"Error starting background processing: {str(e)}")
        return jsonify({'error': 'Failed to start background processing'}), 500
    
    return jsonify({
        'message': '文件已接收，正在处理...',
        'saved_files': saved_files,
        'not_saved_files': not_saved_files
    }), 202


def process_files(files, session_csv_folder):
    print("Starting background processing...")
    error_messages = []
    
    for file_info in files:
        save_path = file_info['path']
        try:
            parsed_basic_doc = parser.parse(save_path)
            node_count = len(parsed_basic_doc.nodes)
            total_length = sum(len(str(node)) for node in parsed_basic_doc.nodes)

            # 生成CSV文件名
            csv_filename = os.path.basename(save_path).replace('.pdf', '.csv')
            csv_path = os.path.join(session_csv_folder, csv_filename)
            
            # 保存CSV文件
            with open(csv_path, mode='w', newline='', encoding='utf-8') as csvfile:
                csv_writer = csv.writer(csvfile)
                csv_writer.writerow([os.path.basename(save_path), '', ''])
                csv_writer.writerow([node_count, total_length, ''])
            
            print(f"Processing completed for file: {save_path}")
            print(f"CSV file saved to: {csv_path}")

        except Exception as e:
            error_msg = f"Error processing file {save_path}: {str(e)}"
            print(error_msg)
            error_messages.append(error_msg)
            # 将错误信息写入文件
            error_file = os.path.join(session_csv_folder, "errors.log")
            with open(error_file, 'a') as f:
                f.write(error_msg + "\n")
    
    # 如果有错误，返回错误信息
    if error_messages:
        return {'status': 'error', 'messages': error_messages}
    return {'status': 'success'}

@app.route('/api/status/<session_id>', methods=['GET'])
def get_processing_status(session_id):
    error_file = os.path.join(UPLOAD_BASE_FOLDER, session_id, 'csv', 'errors.log')
    if os.path.exists(error_file):
        with open(error_file, 'r') as f:
            errors = f.readlines()
        return jsonify({
            'status': 'error',
            'messages': [error.strip() for error in errors]
        }), 400
    
    return jsonify({'status': 'processing'}), 200

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5328)