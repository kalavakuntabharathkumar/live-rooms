import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/message.dart';

typedef MessageCallback = void Function(Message message);
typedef UserEventCallback = void Function(String uid, String displayName);
typedef MembersCallback = void Function(List<Map<String, dynamic>> members);

class SocketService {
  static const String _serverUrl =
      'https://live-rooms-api-XXXXXXXXXXXX-uc.a.run.app';

  late final io.Socket _socket;
  String? _currentRoomId;

  MessageCallback? onNewMessage;
  UserEventCallback? onUserJoined;
  UserEventCallback? onUserLeft;
  MembersCallback? onRoomMembers;
  void Function(String message)? onError;

  SocketService() {
    _socket = io.io(
      _serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .build(),
    );

    _socket.onConnect((_) => print('Socket connected'));
    _socket.onDisconnect((_) => print('Socket disconnected'));

    _socket.on('new_message', (data) {
      final msg = Message.fromJson(data as Map<String, dynamic>);
      onNewMessage?.call(msg);
    });

    _socket.on('user_joined', (data) {
      final d = data as Map<String, dynamic>;
      onUserJoined?.call(d['uid'] as String, d['displayName'] as String);
    });

    _socket.on('user_left', (data) {
      final d = data as Map<String, dynamic>;
      onUserLeft?.call(d['uid'] as String, d['displayName'] as String);
    });

    _socket.on('room_members', (data) {
      final d = data as Map<String, dynamic>;
      final members = List<Map<String, dynamic>>.from(d['members'] as List);
      onRoomMembers?.call(members);
    });

    _socket.on('error', (data) {
      final d = data as Map<String, dynamic>;
      onError?.call(d['message'] as String? ?? 'Unknown socket error');
    });
  }

  void connect() {
    if (!_socket.connected) _socket.connect();
  }

  void disconnect() {
    _socket.disconnect();
    _currentRoomId = null;
  }

  void joinRoom(String roomId, String token) {
    connect();
    _socket.emit('join_room', {'roomId': roomId, 'token': token});
    _currentRoomId = roomId;
  }

  void leaveRoom() {
    if (_currentRoomId != null) {
      _socket.emit('leave_room', {'roomId': _currentRoomId});
      _currentRoomId = null;
    }
  }

  void sendMessage(String roomId, String text, String token) {
    _socket.emit('send_message', {
      'roomId': roomId,
      'text': text,
      'token': token,
    });
  }

  void dispose() {
    leaveRoom();
    _socket.dispose();
  }
}
