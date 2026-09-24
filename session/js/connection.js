(function(root){
  'use strict';
  class SessionConnection {
    constructor({host,metadata,onMessage,onStatus,createPeer=()=>new Peer(MR_CONFIG.peer),now=()=>Date.now()}){
      Object.assign(this,{host,metadata,onMessage,onStatus,createPeer,now});
      this.attempt=0;this.lastHeard=now();this.lastTick=now();this.stopped=false;this.connecting=false;
      this.tickTimer=setInterval(()=>this.tick(),5000);
    }
    get open(){return !!this.connection?.open;}
    send(message){if(!this.open)return false;this.wire(message);return true;}
    start(){this.connect();}
    retry(){
      if(this.stopped||this.open||this.retryTimer)return;
      this.onStatus('reconnecting');
      const delay=Math.min(1000*2**Math.min(this.attempt++,3),8000);
      this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connect();},delay);
    }
    connect(){
      if(this.stopped||this.open||this.connecting)return;
      clearTimeout(this.retryTimer);this.retryTimer=null;
      if(!this.peer||this.peer.destroyed){
        let peer;try{peer=this.createPeer();}catch{this.retry();return;}
        this.peer=peer;this.peerStarted=this.now();
        peer.on('open',()=>{if(this.peer===peer)this.connect();});
        peer.on('error',()=>{if(this.peer===peer&&!this.open)this.retry();});
        // A lost signaling socket does not break an established DataChannel.
        peer.on('disconnected',()=>{if(this.peer!==peer||this.stopped)return;try{peer.reconnect();}catch{}if(!this.open)this.retry();});return;
      }
      if(!this.peer.open){if(this.peer.disconnected)try{this.peer.reconnect();}catch{}this.retry();return;}
      this.connecting=true;
      let next;try{next=this.peer.connect(this.host,{reliable:true,metadata:this.metadata});}catch{this.connecting=false;this.retry();return;}
      this.connection=next;
      this.wire=MR.wire(next,message=>{if(this.connection===next){this.lastHeard=this.now();this.onMessage(message);}},()=>this.drop(next),()=>{if(this.connection===next)this.lastHeard=this.now();});
      this.attemptTimer=setTimeout(()=>this.drop(next),15000);
      next.on('open',()=>{
        if(this.connection!==next)return;
        clearTimeout(this.attemptTimer);this.connecting=false;this.attempt=0;this.lastHeard=this.now();
        this.onStatus('connected');this.send({type:'ping',time:this.now()});
      });
      next.on('close',()=>{if(this.connection!==next)return;clearTimeout(this.attemptTimer);this.connecting=false;this.connection=null;this.onStatus('disconnected');this.retry();});
      next.on('error',()=>this.drop(next));
    }
    drop(next){
      if(this.connection!==next||this.stopped)return;
      clearTimeout(this.attemptTimer);this.connection=null;this.connecting=false;next.close();
      this.onStatus('disconnected');this.retry();
    }
    tick(){
      const now=this.now(),woke=now-this.lastTick>15000;this.lastTick=now;
      if(woke)this.lastHeard=now;
      if(!this.open){
        if(woke)this.peerStarted=now;
        if(this.peer&&!this.peer.open&&!this.connecting&&now-this.peerStarted>20000){const old=this.peer;this.peer=null;old.destroy();}
        this.retry();return;
      }
      if(typeof document!=='undefined'&&document.hidden)return;
      if(now-this.lastHeard>60000){this.drop(this.connection);return;}
      this.send({type:'ping',time:now});
    }
    resume(){this.lastHeard=this.now();this.lastTick=this.now();if(this.open)this.send({type:'ping',time:this.now()});else if(!this.connecting)this.connect();}
    stop(){this.stopped=true;clearInterval(this.tickTimer);clearTimeout(this.retryTimer);clearTimeout(this.attemptTimer);this.connection?.close();this.peer?.destroy();}
  }
  root.MR_CONNECTION=SessionConnection;
  if(typeof module!=='undefined')module.exports=SessionConnection;
})(typeof window==='undefined'?globalThis:window);
