FROM python:3.13.5

WORKDIR /code

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better Docker caching
COPY requirements.txt /code/

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy application code
COPY ./app /code/app

# Create models directory
RUN mkdir -p /code/app/models

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]