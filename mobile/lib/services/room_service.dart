import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/room.dart';
import '../models/message.dart';

class RoomService {
  // Replace with your Cloud Run service URL after deployment
  static const String _baseUrl =
      'https://live-rooms-api-XXXXXXXXXXXX-uc.a.run.app/api';

  final String _token;

  RoomService(this._token);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      };

  // ── Rooms ─────────────────────────────────────────────────────────────────

  Future<List<Room>> getRooms() async {
    final res = await http.get(Uri.parse('$_baseUrl/rooms'), headers: _headers);
    _assertOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final list = body['rooms'] as List;
    return list.map((e) => Room.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Room> createRoom(String name, String description) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/rooms'),
      headers: _headers,
      body: jsonEncode({'name': name, 'description': description}),
    );
    _assertOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return Room.fromJson(body['room'] as Map<String, dynamic>);
  }

  Future<void> joinRoom(String roomId) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/rooms/$roomId/join'),
      headers: _headers,
    );
    _assertOk(res);
  }

  Future<void> leaveRoom(String roomId) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/rooms/$roomId/leave'),
      headers: _headers,
    );
    _assertOk(res);
  }

  Future<void> deleteRoom(String roomId) async {
    final res = await http.delete(
      Uri.parse('$_baseUrl/rooms/$roomId'),
      headers: _headers,
    );
    _assertOk(res);
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  Future<List<Message>> getMessages(String roomId) async {
    final res = await http.get(
      Uri.parse('$_baseUrl/rooms/$roomId/messages'),
      headers: _headers,
    );
    _assertOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final list = body['messages'] as List;
    return list
        .map((e) => Message.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void _assertOk(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final body = jsonDecode(res.body) as Map<String, dynamic>?;
      throw Exception(body?['error'] ?? 'Request failed: ${res.statusCode}');
    }
  }
}
