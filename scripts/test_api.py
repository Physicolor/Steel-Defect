#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API Test Script - Create test users and data
"""

import requests
import json
import time

BASE_URL = "http://localhost:8000"


def wait_for_server():
    """Wait for server to start"""
    print("Waiting for server to start...")
    for i in range(30):
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=5)
            if response.status_code == 200:
                print("Server is ready!")
                return True
        except:
            pass
        time.sleep(2)
    print("Server failed to start")
    return False


def register_user(username, password, user_type, email=None, phone=None, company_name=None):
    """Register a user"""
    data = {
        "username": username,
        "password": password,
        "user_type": user_type
    }
    if email:
        data["email"] = email
    if phone:
        data["phone"] = phone
    if company_name:
        data["company_name"] = company_name

    try:
        response = requests.post(f"{BASE_URL}/api/auth/register", json=data, timeout=10)
        if response.status_code == 200:
            print(f"User registered: {username} ({user_type})")
            return response.json()
        else:
            print(f"Failed to register {username}: {response.json().get('detail', 'Unknown error')}")
            return None
    except Exception as e:
        print(f"Error registering {username}: {e}")
        return None


def login_user(username, password):
    """Login and get token"""
    try:
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": username,
            "password": password
        }, timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"Login successful: {username}")
            return data.get("access_token")
        else:
            print(f"Login failed for {username}: {response.json().get('detail', 'Unknown error')}")
            return None
    except Exception as e:
        print(f"Error logging in {username}: {e}")
        return None


def get_user_info(token):
    """Get current user info"""
    try:
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        }, timeout=10)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"Error getting user info: {e}")
        return None


def create_test_users():
    """Create test users"""
    print("\n=== Creating Test Users ===\n")

    # Admin user
    register_user("admin", "admin123", "admin", "admin@steeldefect.com")

    # Personal users
    register_user("zhangsan", "123456", "personal", "zhangsan@example.com", "13800138001")
    register_user("lisi", "123456", "personal", "lisi@example.com", "13800138002")
    register_user("wangwu", "123456", "personal", "wangwu@example.com", "13800138003")

    # Enterprise users
    register_user("baosteel", "123456", "enterprise", "baosteel@example.com", "13800138010", "Baoshan Iron & Steel Co.")
    register_user("wisco", "123456", "enterprise", "wisco@example.com", "13800138011", "Wuhan Iron & Steel Co.")


def test_login():
    """Test login for all users"""
    print("\n=== Testing Login ===\n")

    users = [
        ("admin", "admin123"),
        ("zhangsan", "123456"),
        ("lisi", "123456"),
        ("wangwu", "123456"),
        ("baosteel", "123456"),
        ("wisco", "123456")
    ]

    tokens = {}
    for username, password in users:
        token = login_user(username, password)
        if token:
            tokens[username] = token

    return tokens


def test_get_user_info(tokens):
    """Test getting user info"""
    print("\n=== Testing Get User Info ===\n")

    for username, token in tokens.items():
        info = get_user_info(token)
        if info:
            print(f"User: {info.get('username')}, Type: {info.get('user_type')}, Email: {info.get('email')}")


def main():
    """Main function"""
    print("=" * 50)
    print("Steel Defect Detection System - API Test")
    print("=" * 50)

    if not wait_for_server():
        return

    # Create users
    create_test_users()

    # Test login
    tokens = test_login()

    # Test get user info
    test_get_user_info(tokens)

    print("\n" + "=" * 50)
    print("Test completed!")
    print("=" * 50)

    # Print summary
    print("\n=== User Accounts ===")
    print("Admin: admin / admin123")
    print("Personal: zhangsan, lisi, wangwu / 123456")
    print("Enterprise: baosteel, wisco / 123456")


if __name__ == "__main__":
    main()
