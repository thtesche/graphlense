import pytest
import json
import time
import urllib.error
from unittest.mock import MagicMock, patch

# Ensure we can import main
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

import main
from main import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

@pytest.fixture(autouse=True)
def mock_cache_file(tmp_path):
    # Sandbox cache file to temporary directory
    temp_cache = str(tmp_path / "session_cache_test.json")
    with patch('main.CACHE_FILE', temp_cache):
        yield

def test_health(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'ok'
    assert 'message' in data

# --- Session / Cache Helper Tests ---

def test_session_cache_set_and_get():
    main.set_user_sid("test_sid_123", "alice")
    user = main.get_user_from_sid("test_sid_123")
    assert user == "alice"

def test_session_cache_expired():
    # Set session that expires in the past
    with patch('time.time', return_value=1000):
        main.set_user_sid("expired_sid", "bob")
    
    # Get user at present time (time > 1000 + 14 days)
    user = main.get_user_from_sid("expired_sid")
    assert user is None

def test_session_cache_invalid_sid():
    assert main.get_user_from_sid(None) is None
    assert main.get_user_from_sid("nonexistent_sid") is None

# --- Login Endpoints Tests ---

def test_login_missing_credentials(client):
    response = client.post('/login', json={"account": "user"})
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['success'] is False
    assert 'Missing credentials' in data['error']['message']

@patch('main.urllib.request.urlopen')
def test_login_success(mock_urlopen, client):
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "success": True,
        "data": {"sid": "valid_sid_123", "account": "alice"}
    }).encode('utf-8')
    mock_urlopen.return_value.__enter__.return_value = mock_response

    response = client.post('/login', json={
        "account": "alice",
        "passwd": "password",
        "otp_code": "123456"
    })
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] is True
    assert data['data']['sid'] == "valid_sid_123"
    
    # Verify cached session
    assert main.get_user_from_sid("valid_sid_123") == "alice"

@patch('main.urllib.request.urlopen')
def test_login_failure_from_nas(mock_urlopen, client):
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "success": False,
        "error": {"code": 401, "message": "Invalid password"}
    }).encode('utf-8')
    mock_urlopen.return_value.__enter__.return_value = mock_response

    response = client.post('/login', json={
        "account": "alice",
        "passwd": "wrong_password"
    })
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] is False
    assert data['error']['code'] == 401

@patch('main.urllib.request.urlopen')
def test_login_nas_exception(mock_urlopen, client):
    mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

    response = client.post('/login', json={
        "account": "alice",
        "passwd": "password"
    })
    assert response.status_code == 500
    data = json.loads(response.data)
    assert data['success'] is False
    assert 'Connection refused' in data['error']['message']

# --- Filters Endpoint Tests ---

def test_filters_unauthorized(client):
    response = client.get('/filters')
    assert response.status_code == 401

@patch('main.get_user_from_sid')
def test_filters_driver_not_initialized(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    original_driver = main.driver
    main.driver = None
    try:
        response = client.get('/filters')
        assert response.status_code == 500
        data = json.loads(response.data)
        assert "driver not initialized" in data['error']
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_filters_success(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    
    mock_result = MagicMock()
    mock_record = MagicMock()
    mock_record.data.return_value = {
        "families": ["Family Alpha", "Family Beta"],
        "persons": ["Charlie", "Diana"],
        "countries": ["Germany", "Switzerland"]
    }
    mock_result.single.return_value = mock_record
    mock_session.run.return_value = mock_result
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/filters')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['families'] == ["Family Alpha", "Family Beta"]
        assert data['persons'] == ["Charlie", "Diana"]
        assert data['countries'] == ["Germany", "Switzerland"]
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_filters_db_error(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    mock_session.run.side_effect = Exception("Cypher syntax error")
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/filters')
        assert response.status_code == 500
        data = json.loads(response.data)
        assert "Cypher syntax error" in data['error']
    finally:
        main.driver = original_driver

# --- Photos Endpoint Tests ---

def test_photos_unauthorized(client):
    response = client.get('/photos')
    assert response.status_code == 401

@patch('main.get_user_from_sid')
def test_photos_driver_not_initialized(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    original_driver = main.driver
    main.driver = None
    try:
        response = client.get('/photos')
        assert response.status_code == 500
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_photos_success(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    
    mock_record = MagicMock()
    mock_record.data.return_value = {"id": "p1", "cache_key": "k1", "takentime": 12345}
    mock_result = MagicMock()
    mock_result.__iter__.return_value = [mock_record]
    mock_session.run.return_value = mock_result
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        # Test without parameters
        response = client.get('/photos')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['owner'] == 'alice'
        assert len(data['photos']) == 1
        assert data['photos'][0]['id'] == 'p1'
        
        # Test with family, person, country query parameters to cover query generation branch
        response_filtered = client.get('/photos?family=Alpha&person=Charlie&country=Germany')
        assert response_filtered.status_code == 200
        
        # Verify query parameters were passed in Cypher call
        mock_session.run.assert_called()
        last_call_args = mock_session.run.call_args[1]
        assert last_call_args['family'] == 'Alpha'
        assert last_call_args['person'] == 'Charlie'
        assert last_call_args['country'] == 'Germany'
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_photos_db_error(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    mock_session.run.side_effect = Exception("DB query crash")
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/photos')
        assert response.status_code == 500
        data = json.loads(response.data)
        assert "Database Query Failed" in data['error']
    finally:
        main.driver = original_driver

# --- Photo Details Endpoint Tests ---

def test_photo_details_unauthorized(client):
    response = client.get('/photo/p1/details')
    assert response.status_code == 401

@patch('main.get_user_from_sid')
def test_photo_details_driver_not_initialized(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    original_driver = main.driver
    main.driver = None
    try:
        response = client.get('/photo/p1/details')
        assert response.status_code == 500
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_photo_details_success(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    
    # Mock records: details queries return relations matching family/person
    mock_record1 = MagicMock()
    mock_record1.data.return_value = {
        "person_in_photo": "Charlie",
        "family_name": "Family Alpha",
        "family_members": ["Charlie", "Diana"]
    }
    mock_result = MagicMock()
    mock_result.__iter__.return_value = [mock_record1]
    mock_session.run.return_value = mock_result
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/photo/p1/details')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert "Charlie" in data['persons_in_photo']
        assert data['families'][0]['name'] == 'Family Alpha'
        assert data['families'][0]['members'] == ['Charlie', 'Diana']
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_photo_details_db_error(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    mock_session.run.side_effect = Exception("DB error details")
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/photo/p1/details')
        assert response.status_code == 500
    finally:
        main.driver = original_driver

# --- Grouped Photos Endpoint Tests ---

def test_grouped_unauthorized(client):
    response = client.get('/photos/grouped')
    assert response.status_code == 401

@patch('main.get_user_from_sid')
def test_grouped_driver_not_initialized(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    original_driver = main.driver
    main.driver = None
    try:
        response = client.get('/photos/grouped')
        assert response.status_code == 500
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_grouped_invalid_by(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/photos/grouped?by=unknown_key')
        assert response.status_code == 400
        data = json.loads(response.data)
        assert "Invalid grouping field" in data['error']
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_grouped_success(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    
    # Mock records for grouping by family
    record_data = {
        "group_name": "Family Alpha",
        "photos": [
            {"id": "p1", "cache_key": "k1", "takentime": 100},
            {"id": "p2", "cache_key": "k2", "takentime": 200}
        ]
    }
    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = lambda key: record_data[key]
    mock_result = MagicMock()
    mock_result.__iter__.return_value = [mock_record]
    mock_session.run.return_value = mock_result
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        # Group by family
        response_fam = client.get('/photos/grouped?by=family')
        assert response_fam.status_code == 200
        data_fam = json.loads(response_fam.data)
        assert data_fam[0]['group_name'] == "Family Alpha"
        # Ensure photo ordering by takentime DESC (p2 has 200, so it should be first)
        assert data_fam[0]['photos'][0]['id'] == 'p2'
        
        # Test routing for person and location keys to ensure all queries compile
        response_person = client.get('/photos/grouped?by=person')
        assert response_person.status_code == 200
        
        response_loc = client.get('/photos/grouped?by=location')
        assert response_loc.status_code == 200
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_grouped_db_error(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    mock_session.run.side_effect = Exception("DB group crash")
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/photos/grouped?by=family')
        assert response.status_code == 500
    finally:
        main.driver = original_driver

# --- Graph Endpoint Tests ---

def test_graph_unauthorized(client):
    response = client.get('/graph')
    assert response.status_code == 401

@patch('main.get_user_from_sid')
def test_graph_driver_not_initialized(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    original_driver = main.driver
    main.driver = None
    try:
        response = client.get('/graph')
        assert response.status_code == 500
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_graph_success(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    
    # Mock graph components
    mock_p = MagicMock()
    mock_p.element_id = "p1"
    mock_p.get.side_effect = lambda k, default=None: {
        "filename": "img1.jpg", "cache_key": "k1", "id": "1", "takentime": 1000
    }.get(k, default)
    
    mock_m = MagicMock()
    mock_m.labels = {"Person"}
    mock_m.element_id = "m1"
    mock_m.get.side_effect = lambda k, default=None: {
        "name": "Charlie"
    }.get(k, default)
    
    mock_r = MagicMock()
    mock_r.type = "HAS_PERSON"
    
    # Record has p, r, m
    record_dict = {"p": mock_p, "r": mock_r, "m": mock_m}
    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = lambda key: record_dict[key]
    
    mock_result = MagicMock()
    mock_result.__iter__.return_value = [mock_record]
    mock_session.run.return_value = mock_result
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/graph?limit=15')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data['nodes']) == 2
        # Check node ids
        ids = [node['id'] for node in data['nodes']]
        assert "photo_p1" in ids
        assert "person_m1" in ids
        # Check link
        assert data['links'][0]['source'] == "photo_p1"
        assert data['links'][0]['target'] == "person_m1"
        assert data['links'][0]['type'] == "HAS_PERSON"
    finally:
        main.driver = original_driver

@patch('main.get_user_from_sid')
def test_graph_db_error(mock_get_user, client):
    mock_get_user.return_value = 'alice'
    
    mock_driver = MagicMock()
    mock_session = MagicMock()
    mock_driver.session.return_value.__enter__.return_value = mock_session
    mock_session.run.side_effect = Exception("DB Graph crash")
    
    original_driver = main.driver
    main.driver = mock_driver
    try:
        response = client.get('/graph')
        assert response.status_code == 500
    finally:
        main.driver = original_driver
