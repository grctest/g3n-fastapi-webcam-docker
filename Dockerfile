FROM python:3.13.5

WORKDIR /code

# Update package lists and install base dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg \
    lsb-release \
    software-properties-common \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Fix GPG issues and install build tools
RUN apt-get update && apt-get install -y \
    cmake \
    clang \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better Docker caching
COPY requirements.txt /code/

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy application code
COPY ./app /code/app

# Copy frontend code
COPY ./frontend/astroDist /code/frontend/astroDist

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]