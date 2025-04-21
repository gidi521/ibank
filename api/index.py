from flask import Flask, request, jsonify
import os
import time
from concurrent.futures import ThreadPoolExecutor
import openparse
from werkzeug.utils import secure_filename
from openai import OpenAI
import csv
import logging
from datetime import datetime
import openpyxl

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

# 在文件顶部添加日志配置
logging.basicConfig(
    filename='api1.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.route('/api/python', methods=['POST'])
def upload_file():
    # 检查是否有文件
    if 'files' not in request.files:
        logger.error('No file part in request')
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
            logger.warning(f'Empty filename received')
            continue
        else:
            logger.info(f"Received file: {file.filename}")
            
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
        logger.warning(f"Processing file: {filename}")
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
                logger.error(f"Background task failed: {str(e)}")
        future.add_done_callback(callback)
        logger.info("Background processing started successfully")
    except Exception as e:
        logger.error(f"Error starting background processing: {str(e)}")
        return jsonify({'error': 'Failed to start background processing'}), 500
    
    return jsonify({
        'message': '文件已接收，正在处理...',
        'saved_files': saved_files,
        'not_saved_files': not_saved_files
    }), 202


def process_files(files, session_csv_folder):
    logger.info("Starting background processing...")
    error_messages = []
    
    for file_info in files:
        save_path = file_info['path']
        try:
            # 生成CSV文件名
            csv_filename = os.path.basename(save_path).replace('.pdf', '.csv')
            csv_path = os.path.join(session_csv_folder, csv_filename)

            # 解析PDF文件
            logger.warning(f"Processing file: {save_path}")
            parsed_basic_doc = parser.parse(save_path)
            logger.warning(f"parsed_basic_doc: {save_path}")
            node_count = len(parsed_basic_doc.nodes)
            total_length = sum(len(str(node)) for node in parsed_basic_doc.nodes)

            # 把每一个node的序号、长度，以及内容，记录到log中，用于研究node的结构
            # for index, node in enumerate(parsed_basic_doc.nodes, start=1):
            #     for idx, element in enumerate(node, start=1):
            #         element_str = str(element)
            #         element_length = len(element_str)
            #         if element_length > 50000:
            #             logger.warning(f"Element Index {idx} in Node {index} has length greater than 50000. Element Content: {element_str}")

                
            # 新建一个nodes列表，用于存储需要处理的node
            new_nodes = []
            total_length_new_nodes = 0
            logger.warning(f"new_nodes starting: {save_path}")
            for index, node in enumerate(parsed_basic_doc.nodes, start=1):
                new_elements = []
                total_length_new_elements = 0
                for idx, element in enumerate(node, start=1):
                    element_str = str(element)
                    element_length = len(element_str)
                    if element_str.startswith("('text'"):
                        new_elements.append(element)
                        total_length_new_elements += element_length
                        logger.warning(f"Element Index {idx} in Node {index} is saved. Element Content Head: {element_str[:100]}")
                        logger.warning(f"Element Index {idx} in Node {index} is saved. Element Content Tail: {element_str[:100]}")
                    
                    if element_length < 57344:
                        # new_elements.append(element)
                        # total_length_new_elements += element_length
                        logger.warning(f"Element Index {idx} in Node {index} has length less than 50000. Element Content Head: {element_str[:100]}")
                        logger.warning(f"Element Index {idx} in Node {index} has length less than 50000. Element Content Tail: {element_str[-100:]}")
                    else:
                        logger.warning(f"Element Index {idx} in Node {index} has length greater than 50000. Element Content Head: {element_str[:1000]}")
                        logger.warning(f"Element Index {idx} in Node {index} has length greater than 50000. Element Content Tail: {element_str[-1000:]}")

                new_nodes.append(new_elements)
                total_length_new_nodes += total_length_new_elements
            logger.warning(f"new_nodes done: {save_path}")
            # 检查总长度是否超过50000
            if total_length_new_nodes < 57344:
                logger.warning("sending to AI:")
                completion = client.chat.completions.create(
                    model="deepseek-v3",
                    messages=[
                        {'role': 'user', 'content': f'这是一个bankstatement的pdf文件内容的读取结果，请将其内容转换为以csv文件的格式，所有数值都不需要分位符。{new_nodes}'}
                    ]
                )
                logger.warning("最终答案：")
                content = completion.choices[0].message.content
                start_index = content.find('```')
                if start_index != -1:
                    start_index += 3
                    end_index = content.find('```', start_index)
                    if end_index != -1:
                        result = content[start_index:end_index].strip()
                        # 删除第一行的"csv"字样
                        if result.startswith('csv\n'):
                            result = result[4:]
                        
                        logger.warning(f"result without ```: \n{result}")
                        # 将result写入CSV文件
                        logger.warning("writing to csv:")
                        try:
                            # Split the result into lines
                            lines = result.split('\n')
                            # Create a CSV reader to parse the lines
                            csv_reader = csv.reader(lines)
                            # Write the parsed data to the CSV file
                            with open(csv_path, mode='w', newline='', encoding='utf-8') as csvfile:
                                csv_writer = csv.writer(csvfile)
                                for row in csv_reader:
                                    csv_writer.writerow(row)
                            logger.info(f"Successfully wrote result to {csv_path}")

                            # Create a new Excel workbook and select the active sheet
                            wb = openpyxl.Workbook()
                            ws = wb.active

                            # Reset the CSV reader
                            csv_reader = csv.reader(result.split('\n'))

                            # Write data from CSV reader to Excel sheet
                            for row in csv_reader:
                                ws.append(row)

                            # Save the Excel file
                            excel_path = os.path.splitext(csv_path)[0] + '.xlsx'
                            wb.save(excel_path)
                            logger.info(f"Successfully wrote result to {excel_path}")
                            
                        except Exception as e:
                            error_msg = f"Error writing result to {csv_path}: {str(e)}"
                            logger.error(error_msg)
                            # # Write the error message to the error file
                            # error_file = os.path.join(session_csv_folder, "errors.log")
                            # with open(error_file, 'a') as f:
                            #     f.write(error_msg + "\n")
                    else:
                        logger.warning("There is no second ``` in content:", content)
                else:
                    logger.warning("There is nt ``` in content:", content)
            else:
                logger.warning("total_length_new_nodes greater than 57344:", total_length_new_nodes)
                error_msg = f"Background error processing file {save_path}: file too long"
                error_messages.append(error_msg)

        except Exception as e:
            error_msg = f"Background error processing file {save_path}: {str(e)}"
            logger.error(error_msg)
            error_messages.append(error_msg)
            # 将错误信息写入文件
            # error_file = os.path.join(session_csv_folder, "errors.log")
            # with open(error_file, 'a') as f:
            #     f.write(error_msg + "\n")
    
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