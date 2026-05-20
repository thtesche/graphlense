import pytest
import json
from unittest.mock import MagicMock, patch

# Ensure we can import main
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from main import app
import main

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'ok'

@patch('main.urllib.request.urlopen')
def test_login_success(mock_urlopen, client):
    # Mocking urlopen response
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "success": True,
        "data": {"sid": "test_sid", "account": "test_user"}
    }).encode('utf-8')
    # urlopen is used in a with block
    mock_urlopen.return_value.__enter__.return_value = mock_response

    response = client.post('/login', json={
        "account": "test_user",
        "passwd": "password"
    })
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] is True

@patch('main.get_user_from_sid')
def test_filters(mock_get_user, client):
    mock_get_user.return_value = 'test_user'
    
    # Mock the neo4j driver
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    
    # Mock result from DB
    mock_result = MagicMock()
    mock_record = MagicMock()
    mock_record.data.return_value = {
        "families": ["Fam A"],
        "persons": ["Person A"],
        "countries": ["Country A"]
    }
    mock_result.single.return_value = mock_record
    mock_session.run.return_value = mock_result
    
    # Patch driver in main
    original_driver = main.driver
    main.driver = mock_driver
    
    try:
        response = client.get('/filters')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['families'] == ["Fam A"]
        assert data['persons'] == ["Person A"]
        assert data['countries'] == ["Country A"]
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_photos_unauthorized(mock_get_user, client):
    mock_get_user.return_value = None
    response = client.get('/photos')
    assert response.status_code == 401
