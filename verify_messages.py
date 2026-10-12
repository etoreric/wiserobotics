import runpy

mod = runpy.run_path('app.py')
app = mod['app']
client = app.test_client()

resp = client.post('/api/messages', data={
    'firstName': 'Ada',
    'lastName': 'Lovelace',
    'email': 'ada@example.com',
    'phone': '123456789',
    'interest': 'Robotics',
    'message': 'I would like to learn more about your STEM camps.',
    'newsletter': 'yes',
})
print('POST', resp.status_code, resp.get_json())

with client.session_transaction() as session:
    session['admin'] = True

resp = client.get('/admin/api/messages')
msg = resp.get_json()
print('GET', resp.status_code, len(msg), msg[0]['email'] if msg else None)
