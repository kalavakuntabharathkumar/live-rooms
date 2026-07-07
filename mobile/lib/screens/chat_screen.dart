import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/room.dart';
import '../models/message.dart';
import '../services/auth_service.dart';
import '../services/room_service.dart';
import '../services/socket_service.dart';
import '../widgets/message_bubble.dart';

class ChatScreen extends StatefulWidget {
  final Room room;
  final String token;

  const ChatScreen({super.key, required this.room, required this.token});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final _socketService = SocketService();
  late final RoomService _roomService;

  final List<Message> _messages = [];
  final List<Map<String, dynamic>> _members = [];
  bool _isLoadingHistory = true;

  @override
  void initState() {
    super.initState();
    _roomService = RoomService(widget.token);

    // Socket event handlers
    _socketService.onNewMessage = (msg) {
      setState(() => _messages.add(msg));
      _scrollToBottom();
    };
    _socketService.onUserJoined = (uid, name) {
      _showSystemMessage('$name joined the room');
    };
    _socketService.onUserLeft = (uid, name) {
      _showSystemMessage('$name left the room');
    };
    _socketService.onRoomMembers = (members) {
      setState(() {
        _members
          ..clear()
          ..addAll(members);
      });
    };
    _socketService.onError = (msg) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.red),
        );
      }
    };

    // Connect socket and load history
    _socketService.joinRoom(widget.room.id, widget.token);
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    try {
      final msgs = await _roomService.getMessages(widget.room.id);
      setState(() {
        _messages
          ..clear()
          ..addAll(msgs);
        _isLoadingHistory = false;
      });
      _scrollToBottom();
    } catch (_) {
      setState(() => _isLoadingHistory = false);
    }
  }

  void _sendMessage() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;
    _socketService.sendMessage(widget.room.id, text, widget.token);
    _messageController.clear();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _showSystemMessage(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  void dispose() {
    _socketService.leaveRoom();
    _socketService.dispose();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<AuthService>().currentUser;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.room.name),
            Text(
              '${_members.length} online',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.people_outline),
            tooltip: 'Members',
            onPressed: () => _showMembersSheet(context),
          ),
        ],
      ),
      body: Column(
        children: [
          // Message history
          Expanded(
            child: _isLoadingHistory
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? const Center(child: Text('No messages yet. Say hello! 👋'))
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        itemCount: _messages.length,
                        itemBuilder: (ctx, i) => MessageBubble(
                          message: _messages[i],
                          isMe: _messages[i].senderId == me?.uid,
                        ),
                      ),
          ),

          // Input bar
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(
                top: BorderSide(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _sendMessage(),
                      decoration: InputDecoration(
                        hintText: 'Type a message…',
                        filled: true,
                        fillColor:
                            Theme.of(context).colorScheme.surfaceVariant,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sendMessage,
                    icon: const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showMembersSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (_) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Online Members (${_members.length})',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: _members.length,
              itemBuilder: (_, i) => ListTile(
                leading: CircleAvatar(
                  child: Text(
                    (_members[i]['displayName'] as String? ?? '?')[0]
                        .toUpperCase(),
                  ),
                ),
                title: Text(_members[i]['displayName'] as String? ?? 'Unknown'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
